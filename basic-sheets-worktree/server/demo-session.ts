import { randomUUID } from "node:crypto";
import type {
  CollabMemberContext,
} from "@univerjs-pro/collaboration-service";
import type { DemoUser } from "./demo-user.js";

export function demoCallOptions(user: DemoUser): CollabMemberContext {
  const customData = { user };
  return {
    memberID: `http-${randomUUID()}`,
    userID: user.userId,
    customData,
  };
}
