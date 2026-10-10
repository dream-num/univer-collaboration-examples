import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { UnitAction, UnitObject, UniverType } from "@univerjs/protocol";

test("published SDK assembly: auth, five Units, ACL, exchange, persistence and shutdown", { timeout: 60_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "all-integration-"));
  const children = new Set();
  t.after(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
      }
    }
    await rm(directory, { recursive: true, force: true });
  });

  async function start() {
    const child = spawn(process.execPath, ["dist/server/main.js"], {
      cwd: new URL("../", import.meta.url),
      env: { ...process.env, HOST: "127.0.0.1", PORT: "0", DATABASE_FILENAME: join(directory, "collaboration.sqlite") },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(child);
    let output = "";
    const exited = once(child, "exit");
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 15_000);
      child.stdout.on("data", (data) => {
        output += data;
        const match = output.match(/running at (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      child.stderr.on("data", (data) => { output += data; });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      void exited.then(([code, signal]) => {
        clearTimeout(timer);
        reject(new Error(`Server exited (${code}, ${signal}): ${output}`));
      });
    });
    return {
      url,
      async stop() {
        child.kill("SIGTERM");
        let timer;
        try {
          const [code, signal] = await Promise.race([
            exited,
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Shutdown timed out: ${output}`)), 5_000); }),
          ]);
          assert.equal(signal, null, output);
          assert.equal(code, 0, output);
        } finally {
          clearTimeout(timer);
        }
      },
    };
  }

  let server = await start();
  const request = (path, { cookie, json, ...options } = {}) => fetch(`${server.url}${path}`, {
    ...options,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(json ? { "Content-Type": "application/json" } : {}) },
    ...(json ? { body: JSON.stringify(json) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  async function register(username) {
    const response = await request("/api/auth/register", {
      method: "POST", json: { username, displayName: username, password: "example-password", locale: "en-US" },
    });
    assert.equal(response.status, 201, await response.text());
    return response.headers.get("set-cookie").split(";")[0];
  }

  assert.equal((await request("/universer-api/user/session-ticket")).status, 401);
  assert.equal((await request("/universer-api/unknown")).status, 404);
  const owner = await register("owner");
  const viewer = await register("viewer");
  const units = [];
  for (const type of [UniverType.UNIVER_SHEET, UniverType.UNIVER_DOC, UniverType.UNIVER_SLIDE, UniverType.UNIVER_BOARD, UniverType.UNIVER_BASE]) {
    const created = await request("/api/units", { method: "POST", cookie: owner, json: { type, name: `Example ${type}` } });
    assert.equal(created.status, 201);
    const { unit } = await created.json();
    units.push(unit);
    const snapshot = await request(`/universer-api/snapshot/${type}/unit/${unit.unitId}/rev/0`, { cookie: owner });
    assert.equal(snapshot.status, 200, await snapshot.text());
    for (const path of [`/universer-api/comment/unit/${unit.unitId}/list`, `/universer-api/history/${unit.unitId}/list`]) {
      const response = await request(path, { cookie: owner });
      assert.equal(response.status, 200, await response.text());
    }
  }

  const sheet = units[0];
  const snapshotPath = `/universer-api/snapshot/${sheet.type}/unit/${sheet.unitId}/rev/0`;
  const denied = await request(snapshotPath, { cookie: viewer });
  assert.equal(denied.status, 403, await denied.text());
  const member = await request(`/api/units/${sheet.unitId}/members/viewer`, { method: "PUT", cookie: owner, json: { role: "viewer" } });
  assert.equal(member.status, 200, await member.text());
  assert.equal((await request(snapshotPath, { cookie: viewer })).status, 200);
  const allowed = await request("/universer-api/authz/-/object/-/batch_allowed", {
    method: "POST", cookie: viewer,
    json: { requests: [{ unitID: sheet.unitId, objectID: sheet.unitId, objectType: UnitObject.Workbook, actions: [UnitAction.View, UnitAction.Edit, UnitAction.Comment] }] },
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual((await allowed.json()).objectActions[0].actions.map((item) => item.allowed), [true, false, true]);

  // Exercise both the native exchange binding and snapshot materialization.
  for (const type of [UniverType.UNIVER_SHEET, UniverType.UNIVER_BASE]) {
    const form = new FormData();
    form.set("type", String(type));
    form.set("file", new Blob(["Item,Amount\nDesign,2400\n"]), "example.csv");
    const imported = await request("/api/import", { method: "POST", cookie: owner, body: form });
    assert.equal(imported.status, 201, imported.status === 201 ? undefined : await imported.text());
    const { unit } = await imported.json();
    const exported = await request(`/api/units/${unit.unitId}/export?format=csv`, { cookie: owner });
    assert.equal(exported.status, 200, exported.status === 200 ? undefined : await exported.text());
    assert.match(await exported.text(), /Design/);
  }

  const removed = await request(`/api/units/${sheet.unitId}`, { method: "DELETE", cookie: owner });
  assert.equal(removed.status, 204, await removed.text());
  assert.equal((await request(`/api/units/${sheet.unitId}`, { cookie: owner })).status, 404);
  const recovered = await request(`/api/units/${sheet.unitId}/recover`, { method: "POST", cookie: owner });
  assert.equal(recovered.status, 200, await recovered.text());
  await server.stop();
  server = await start();
  assert.equal((await request(snapshotPath, { cookie: owner })).status, 200);

  // A live WebSocket must not prevent graceful shutdown.
  const ticketResponse = await request("/universer-api/user/session-ticket", { cookie: owner });
  assert.equal(ticketResponse.status, 200);
  const ticket = await ticketResponse.json();
  assert.equal(typeof ticket.ticket, "string");
  const socket = new WebSocket(`${server.url.replace("http:", "ws:")}/universer-api/comb/connect?sessionTicket=${encodeURIComponent(ticket.ticket)}`);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const closed = new Promise((resolve) => socket.addEventListener("close", resolve, { once: true }));
  await server.stop();
  await closed;
});
