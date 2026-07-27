import { randomUUID } from "node:crypto";
import type {
  CollabCallOptions,
  CollabSession,
} from "@univerjs-pro/collaboration-service";
import type { DemoUser } from "./demo-user.js";

export function demoCallOptions(user: DemoUser): CollabCallOptions {
  const customData = { user };
  const session: CollabSession = {
    memberId: `http-${randomUUID()}`,
    userId: user.userId,
    customData,
  };
  return { session, customData };
}
