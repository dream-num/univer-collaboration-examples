import { CollabError } from "@univerjs-pro/collaboration-service";
import { json, Router } from "express";
import type { AuthService } from "../auth.js";
import type { ApplicationStore } from "../store.js";

export function createAuthRouter(dependencies: {
  readonly authService: AuthService;
  readonly store: ApplicationStore;
}): Router {
  const router = Router();
  router.use(json({ limit: "32kb" }));

  router.post("/login", async (request, response) => {
    const username = stringValue(request.body?.username);
    const password = stringValue(request.body?.password);
    if (!username || !password) {
      throw new CollabError(
        "INVALID_REQUEST",
        "username and password are required"
      );
    }
    const result = await dependencies.authService.login(username, password);
    dependencies.authService.setCookie(response, result.token);
    response.json({ user: result.user });
  });

  router.get("/me", async (request, response) => {
    const user = await dependencies.authService.requireUser(request);
    response.json({ user });
  });

  router.post("/logout", (_request, response) => {
    dependencies.authService.clearCookie(response);
    response.status(204).end();
  });

  router.get("/users", async (request, response) => {
    await dependencies.authService.requireUser(request);
    response.json({ users: dependencies.store.listUsers() });
  });

  return router;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
