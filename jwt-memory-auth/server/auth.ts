import type { IncomingMessage } from "node:http";
import type { Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { AuthenticatedUser } from "./model";
import type { MemoryUserStore } from "./memory-stores";

const COOKIE_NAME = "collab_token";

export class AuthService {
  constructor(
    private readonly users: MemoryUserStore,
    private readonly secret: Uint8Array
  ) {}

  async login(
    username: string,
    password: string
  ): Promise<{ token: string; user: AuthenticatedUser }> {
    const user = await this.users.authenticate(username, password);
    if (!user) {
      throw new Error("Invalid username or password");
    }

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.userId)
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(this.secret);

    return { token, user };
  }

  /** HTTP 请求和 WebSocket upgrade 都是 IncomingMessage，因此共享这段认证。 */
  async requireUser(request: IncomingMessage): Promise<AuthenticatedUser> {
    const token = readCookie(request.headers.cookie, COOKIE_NAME);
    if (!token) throw new Error("Missing authentication cookie");

    const { payload } = await jwtVerify(token, this.secret);
    if (!payload.sub) throw new Error("JWT has no subject");

    const user = this.users.getById(payload.sub);
    if (!user) throw new Error("JWT user no longer exists");
    return user;
  }

  setLoginCookie(response: Response, token: string): void {
    response.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,
      path: "/",
    });
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.[1];
}
