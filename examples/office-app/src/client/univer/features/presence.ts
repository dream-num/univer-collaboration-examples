import {
  CollaborationSessionService,
  MemberService,
  SessionStatus,
} from "@univerjs-pro/collaboration-client";
import type { Univer, UniverInstanceType } from "@univerjs/core";
import { filter, Subscription, switchMap } from "rxjs";
import { clearDisconnectedPresence } from "../../../workarounds/client/disconnected-presence";
import type { EditorPresence } from "../types";

export function observePresence(
  univer: Univer,
  unitId: string,
  unitType: UniverInstanceType,
  onChange: (presence: EditorPresence) => void,
) {
  const injector = univer.__getInjector();
  const sessions = injector.get(CollaborationSessionService);
  const members = injector.get(MemberService);
  const subscriptions = new Subscription();
  let disposed = false;
  let status: EditorPresence["status"] = "connecting";

  const publish = () => {
    if (!disposed) {
      onChange({
        status,
        members: status === "online"
          ? members.getRoom(unitId)?.getAllMembers() ?? []
          : [],
      });
    }
  };

  publish();
  subscriptions.add(members.waitForRoom$(unitId).pipe(
    filter((room) => room != null),
    switchMap((room) => room.members$),
  ).subscribe(publish));

  void sessions.requireSession(unitId, unitType).then((session) => {
    if (disposed) return;
    subscriptions.add(session.sessionStatus$.subscribe({
      next(nextStatus) {
        status = nextStatus === SessionStatus.ONLINE
          ? "online"
          : nextStatus === SessionStatus.OFFLINE ? "offline" : "connecting";
        if (status !== "online") {
          clearDisconnectedPresence(members, unitId);
        }
        publish();
      },
      complete() {
        status = "offline";
        clearDisconnectedPresence(members, unitId);
        publish();
      },
    }));
  }).catch(() => {
    status = "offline";
    publish();
  });

  return {
    dispose() {
      disposed = true;
      subscriptions.unsubscribe();
    },
    reconnect() {
      sessions.reconnect();
    },
  };
}
