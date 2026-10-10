import type { CollabMemberContext } from "@univerjs-pro/collaboration-service";

export function createCollabContext(userId: string): CollabMemberContext {
  return {
    userID: userId,
    memberID: `server:${userId}`,
    customData: Object.create(null) as Record<string, unknown>,
  };
}
