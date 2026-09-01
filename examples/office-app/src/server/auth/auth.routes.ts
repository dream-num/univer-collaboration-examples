import type { IncomingMessage } from "node:http";
import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import type { Locale, User } from "../../shared/api-types";
import {
  AuthError,
  SESSION_DURATION_MS,
  type AuthService,
} from "./auth.service";

const SESSION_COOKIE = "office_session";

function readSessionToken(request: IncomingMessage) {
  for (const item of request.headers.cookie?.split(";") ?? []) {
    const separator = item.indexOf("=");
    if (separator === -1) continue;
    if (item.slice(0, separator).trim() === SESSION_COOKIE)
      return decodeURIComponent(item.slice(separator + 1).trim());
  }
  return undefined;
}

function writeSessionCookie(response: Response, token: string) {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DURATION_MS,
    path: "/",
  });
}

export function createAuthHttp(service: AuthService): {
  router: ExpressRouter;
  currentUser(request: IncomingMessage): User | undefined;
  requireUser(request: Request, response: Response): User | undefined;
} {
  const router = Router();

  function currentUser(request: IncomingMessage): User | undefined {
    return service.currentUser(readSessionToken(request));
  }

  function requireUser(request: Request, response: Response) {
    const user = currentUser(request);
    if (!user) {
      response.status(401).json({ code: "AUTH_REQUIRED" });
      return undefined;
    }
    return user;
  }

  function handleAuthError(error: unknown, response: Response) {
    if (error instanceof AuthError) {
      response.status(error.status).json({ code: error.code });
      return;
    }
    throw error;
  }

  router.post("/register", (request, response) => {
    const body = request.body as Partial<{
      username: string;
      displayName: string;
      password: string;
      locale: string;
    }>;
    try {
      const result = service.register({
        username: body.username ?? "",
        displayName: body.displayName ?? "",
        password: body.password ?? "",
        locale: body.locale === "en-US" ? "en-US" : "zh-CN",
      });
      writeSessionCookie(response, result.token);
      response.status(201).json({ user: result.user });
    } catch (error) {
      handleAuthError(error, response);
    }
  });

  router.post("/login", (request, response) => {
    const body = request.body as Partial<{ username: string; password: string }>;
    try {
      const result = service.login(body.username ?? "", body.password ?? "");
      writeSessionCookie(response, result.token);
      response.json({ user: result.user });
    } catch (error) {
      handleAuthError(error, response);
    }
  });

  router.post("/logout", (request, response) => {
    service.logout(readSessionToken(request));
    response.clearCookie(SESSION_COOKIE, { path: "/" });
    response.sendStatus(204);
  });

  router.patch("/locale", (request, response) => {
    const user = requireUser(request, response);
    if (!user) return;
    const locale = (request.body as { locale?: unknown }).locale;
    if (locale !== "zh-CN" && locale !== "en-US")
      return void response.status(400).json({ code: "INVALID_LOCALE" });
    response.json({ user: service.setLocale(user, locale as Locale) });
  });

  router.get("/me", (request, response) => {
    const user = requireUser(request, response);
    if (user) response.json({ user });
  });

  return { router, currentUser, requireUser };
}
