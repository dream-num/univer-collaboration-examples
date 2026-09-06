import type { MemberService } from "@univerjs-pro/collaboration-client";

/**
 * @univerjs-pro/collaboration-client@1.0.0-insiders.20260902-a58c423
 * 重连 JOIN 只追加成员，断线期间离开的旧成员会残留。应用在非在线状态清空当前房间，
 * 让下一次 JOIN 重建名单与光标。SDK 在重连时替换房间成员后删除此兼容函数；
 * 成员缓存的连接生命周期应由上游 CollaborationSession 管理。
 */
export function clearDisconnectedPresence(members: MemberService, unitId: string) {
  for (const member of members.getRoom(unitId)?.getAllMembers() ?? []) {
    members.removeMember(unitId, member.memberID);
  }
}
