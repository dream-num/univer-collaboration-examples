import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import type { Univer } from "@univerjs/core";
import { UnitObject, UniverType } from "@univerjs/protocol";

// 每个编辑器实例只协作一个业务 Unit；Sheet/图形中的内部 Doc 编辑器由宿主权限控制。
const contentTypes = new Map<number, UnitObject[]>([
  [
    UniverType.UNIVER_DOC,
    [
      UnitObject.Document,
      UnitObject.DocumentSection,
      UnitObject.DocumentParagraph,
      UnitObject.DocumentEntity,
    ],
  ],
  [
    UniverType.UNIVER_SLIDE,
    [UnitObject.Slide, UnitObject.SlidePage, UnitObject.SlideElement, UnitObject.SlideMaster],
  ],
  [UniverType.UNIVER_BOARD, [UnitObject.Board, UnitObject.BoardElement]],
  [
    UniverType.UNIVER_BASE,
    [
      UnitObject.Base,
      UnitObject.BaseTable,
      UnitObject.BaseField,
      UnitObject.BaseRecord,
      UnitObject.BaseView,
      UnitObject.BaseDashboard,
    ],
  ],
]);

export function registerCollaboration(univer: Univer, baseURL: string, unitType: number) {
  univer.registerPlugin(UniverCollaborationPlugin);
  univer.registerPlugin(UniverCollaborationClientPlugin, {
    socketService: BrowserCollaborationSocketService,
    sendChangesetTimeout: 200,
    objectPermissionTypes: contentTypes.get(unitType) ?? [],
    authzUrl: `${baseURL}/authz`,
    snapshotServerUrl: `${baseURL}/snapshot`,
    collabSubmitChangesetUrl: `${baseURL}/comb`,
    collabWebSocketUrl: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/universer-api/comb/connect`,
    wsSessionTicketUrl: `${baseURL}/user/session-ticket`,
  });
  univer.registerPlugin(UniverCollaborationClientUIPlugin);
}
