import type { UnitRepository } from "./units.repository";

export class MemberError extends Error {
  constructor(
    readonly code:
      | "INVALID_ROLE"
      | "MEMBER_NOT_FOUND"
      | "PERMISSION_DENIED"
      | "USER_NOT_FOUND",
    readonly status: number,
  ) {
    super(code);
  }
}

interface MembersServiceOptions {
  readonly repository: UnitRepository;
  invalidateUnitSessions(input: {
    unitID: string;
    userID?: string;
  }): Promise<void>;
}

export function createMembersService(options: MembersServiceOptions) {
  const { repository, invalidateUnitSessions } = options;

  return {
    list(userId: string, unitId: string) {
      assertCreator(repository, userId, unitId);
      return repository.listMembers(unitId);
    },

    async set(
      userId: string,
      unitId: string,
      username: string,
      role: unknown,
    ) {
      assertCreator(repository, userId, unitId);
      if (role !== "editor" && role !== "viewer")
        throw new MemberError("INVALID_ROLE", 400);
      const existingMember = repository
        .listMembers(unitId)
        .some((item) => item.username.toLowerCase() === username.toLowerCase());
      const member = repository.setMemberByUsername(unitId, username, role);
      if (!member) throw new MemberError("USER_NOT_FOUND", 404);

      // New members could not previously join this Unit, so no existing sessions need invalidation.
      if (existingMember) {
        await invalidateUnitSessions({
          unitID: unitId,
          userID: member.userId,
        });
      }
      return member;
    },

    async remove(userId: string, unitId: string, username: string) {
      assertCreator(repository, userId, unitId);
      const member = repository
        .listMembers(unitId)
        .find((item) => item.username.toLowerCase() === username.toLowerCase());
      if (!member || member.role === "creator")
        throw new MemberError("MEMBER_NOT_FOUND", 404);
      repository.removeMember(unitId, member.userId);
      await invalidateUnitSessions({
        unitID: unitId,
        userID: member.userId,
      });
    },
  };
}

function assertCreator(
  repository: UnitRepository,
  userId: string,
  unitId: string,
) {
  if (repository.resolveRole(userId, unitId) !== "creator")
    throw new MemberError("PERMISSION_DENIED", 403);
}

export type MembersService = ReturnType<typeof createMembersService>;
