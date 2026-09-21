import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DemoUser } from "../shared/types";

export const users: readonly DemoUser[] = [
  { userId: "user-alice", username: "Alice", avatar: "" },
  { userId: "user-bob", username: "Bob", avatar: "" },
  { userId: "user-casey", username: "Casey", avatar: "" },
];

// Store demo sessions in memory; the cookie contains only a random session ID.
const sessions = new Map<string, DemoUser>();
const cookieName = "object_permissions_session";
function sessionID(request: IncomingMessage) {
  return request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
}

export function currentUser(request: IncomingMessage) {
  const id = sessionID(request);
  return id ? sessions.get(id) : undefined;
}

export function signIn(request: IncomingMessage, response: ServerResponse, user: DemoUser) {
  const previous = sessionID(request);
  if (previous) sessions.delete(previous);
  const id = randomUUID();
  sessions.set(id, user);
  response.setHeader("Set-Cookie", `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Lax`);
}

export function signOut(request: IncomingMessage, response: ServerResponse) {
  const id = sessionID(request);
  if (id) sessions.delete(id);
  response.setHeader("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
