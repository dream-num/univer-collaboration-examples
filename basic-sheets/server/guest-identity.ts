import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { TLSSocket } from "node:tls";
import type { Guest } from "./demo-store.js";
import { DemoStore } from "./demo-store.js";

const COOKIE_NAME = "univer_basic_guest";
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export class GuestIdentityService {
  private readonly _secret: string;

  constructor(private readonly _store: DemoStore) {
    this._secret = _store.getOrCreateCookieSecret();
  }

  resolve(
    request: IncomingMessage,
    response: ServerResponse
  ): Guest {
    const cookie = parseCookies(request.headers.cookie)[COOKIE_NAME];
    const guestId = cookie ? this._verify(cookie) : null;
    const existing = guestId ? this._store.getGuest(guestId) : null;
    if (existing) return existing;

    const guest = this._store.createGuest();
    const secureAttribute = isSecure(request) ? "; Secure" : "";
    appendSetCookie(
      response,
      `${COOKIE_NAME}=${this._sign(guest.guestId)}; Path=/; HttpOnly; ` +
        `SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secureAttribute}`
    );
    return guest;
  }

  private _sign(guestId: string): string {
    return `${guestId}.${signature(guestId, this._secret)}`;
  }

  private _verify(cookie: string): string | null {
    const separator = cookie.lastIndexOf(".");
    if (separator < 1) return null;
    const guestId = cookie.slice(0, separator);
    const supplied = cookie.slice(separator + 1);
    const expected = signature(guestId, this._secret);
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      return null;
    }
    return guestId;
  }
}

function signature(guestId: string, secret: string): string {
  return createHmac("sha256", secret).update(guestId).digest("base64url");
}

function parseCookies(header: string | undefined): Record<string, string> {
  const values: Record<string, string> = {};
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    values[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return values;
}

function appendSetCookie(response: ServerResponse, value: string): void {
  const existing = response.getHeader("set-cookie");
  const values = Array.isArray(existing)
    ? existing.map(String)
    : existing === undefined
      ? []
      : [String(existing)];
  response.setHeader("set-cookie", [...values, value]);
}

function isSecure(request: IncomingMessage): boolean {
  return (
    (request.socket instanceof TLSSocket && request.socket.encrypted) ||
    request.headers["x-forwarded-proto"] === "https"
  );
}
