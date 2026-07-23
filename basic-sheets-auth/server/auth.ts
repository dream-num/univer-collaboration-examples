import type { IncomingMessage } from "node:http";
import { CollabError } from "@univerjs/collaboration-service";
import type { Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { AuthenticatedUser } from "./model.js";
import type { ApplicationStore } from "./store.js";

const COOKIE_NAME = "basic_sheets_auth";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export const AUTH_COOKIE_NAME = COOKIE_NAME;

export class AuthService {
  private readonly _secret: Uint8Array;

  constructor(
    private readonly _store: ApplicationStore,
    secret: string
  ) {
    this._secret = new TextEncoder().encode(secret);
  }

  async login(
    username: string,
    password: string
  ): Promise<{ readonly token: string; readonly user: AuthenticatedUser }> {
    const user = await this._store.authenticate(username, password);
    if (!user) {
      throw new CollabError("UNAUTHENTICATED", "用户名或密码错误");
    }
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.userId)
      .setIssuedAt()
      .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
      .sign(this._secret);
    return { token, user };
  }

  async requireUser(request: IncomingMessage): Promise<AuthenticatedUser> {
    const token = readCookie(request.headers.cookie, COOKIE_NAME);
    if (!token) throw new CollabError("UNAUTHENTICATED", "请先登录");
    try {
      const { payload } = await jwtVerify(token, this._secret);
      const user = payload.sub ? this._store.getUser(payload.sub) : null;
      if (!user) {
        throw new CollabError("UNAUTHENTICATED", "登录用户不存在");
      }
      return user;
    } catch (error) {
      if (error instanceof CollabError) throw error;
      throw new CollabError("UNAUTHENTICATED", "登录已失效");
    }
  }

  setCookie(response: Response, token: string): void {
    response.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: SESSION_TTL_SECONDS * 1000,
      path: "/",
    });
  }

  clearCookie(response: Response): void {
    response.clearCookie(COOKIE_NAME, { path: "/" });
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}
