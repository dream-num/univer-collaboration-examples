import type { IGetUserResponse } from "@univerjs/protocol";
import type { IPresetPlugin } from "@univerjs/presets";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import {
  ISingleActiveUnitService,
  UniverCollaborationClientPlugin,
} from "@univerjs-pro/collaboration-client";
import {
  BrowserCollaborationSocketService,
  type IUniverCollaborationClientUIConfig,
  UniverCollaborationClientUIPlugin,
  WebBrowserSingleActiveUnitService,
} from "@univerjs-pro/collaboration-client-ui";
import CollaborationClientUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import { UniverEditHistoryLoaderPlugin } from "@univerjs-pro/edit-history-loader";
import {
  CommandType,
  IUniverInstanceService,
  type UnitModel,
  Univer,
  UserManagerService,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import type { SaveSnapshotInput } from "@univerjs/collaboration-service";
import {
  createWorktreeCollaborationConfig,
  createWorktreeMergePreviewConfig,
} from "@univerjs/collaboration-worktree-client";
import { HTTPService } from "@univerjs/network";

const secure = window.location.protocol === "https:";
const httpProtocol = secure ? "https" : "http";
const wsProtocol = secure ? "wss" : "ws";
const host = window.location.host;
const origin = `${httpProtocol}://${host}`;

export type ReviewCollaborationScope =
  | { readonly kind: "trunk" }
  | { readonly kind: "worktree"; readonly worktreeID: string }
  | {
      readonly kind: "merge";
      readonly worktreeID: string;
      readonly preview: SaveSnapshotInput;
    };

let reviewScope: ReviewCollaborationScope | null = null;

export const collaborationLocale = CollaborationClientUIEnUS;

export function configureReviewCollaboration(
  scope: ReviewCollaborationScope
): void {
  reviewScope = scope;
}

export function collaborationPlugins(
  uiConfig: Partial<IUniverCollaborationClientUIConfig> = {}
): IPresetPlugin[] {
  const scopedConfig =
    reviewScope === null || reviewScope.kind === "trunk"
      ? {
          snapshotServerUrl: `${origin}/universer-api/snapshot`,
          collabSubmitChangesetUrl: `${origin}/universer-api/comb`,
          collabWebSocketUrl: `${wsProtocol}://${host}/universer-api/comb/connect`,
          wsSessionTicketUrl: `${origin}/universer-api/user/session-ticket`,
        }
      : reviewScope.kind === "worktree"
        ? createWorktreeCollaborationConfig({
            origin,
            worktreeID: reviewScope.worktreeID,
          })
        : createWorktreeMergePreviewConfig({
            origin,
            worktreeID: reviewScope.worktreeID,
            preview: reviewScope.preview,
          });
  return [
    UniverCollaborationPlugin,
    [
      UniverCollaborationClientPlugin,
      {
        socketService: BrowserCollaborationSocketService,
        enableOfflineEditing: true,
        enableSingleActiveInstanceLock: true,
        enableAuthServer: true,
        override: [
          [
            ISingleActiveUnitService,
            { useClass: WebBrowserSingleActiveUnitService },
          ],
        ],
        authzUrl: `${httpProtocol}://${host}/universer-api/authz`,
        sendChangesetTimeout: 200,
        ...scopedConfig,
      },
    ],
    [UniverCollaborationClientUIPlugin, uiConfig],
  ];
}

export function enforceReadOnlyReview(univer: Univer): void {
  if (document.documentElement.dataset.reviewReadonly !== "true") return;
  const univerAPI = FUniver.newAPI(univer);
  univerAPI.getHooks().onSteady(() => {
    univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, (event) => {
      if (event.options?.fromCollab || event.options?.fromChangeset) {
        return;
      }
      if (
        event.type === CommandType.COMMAND ||
        event.type === CommandType.MUTATION
      ) {
        event.cancel = true;
      }
    });
  });
}

export function historyPlugins(workerURL: string): IPresetPlugin[] {
  return [
    [
      UniverEditHistoryLoaderPlugin,
      {
        historyListServerUrl: `${httpProtocol}://${host}/universer-api/history`,
        univerContainerId: "univer-container",
        workerURL,
      },
    ],
  ];
}

export function registerRawCollaboration(
  univer: Univer,
  uiConfig: Partial<IUniverCollaborationClientUIConfig> = {}
): void {
  for (const plugin of collaborationPlugins(uiConfig)) {
    if (Array.isArray(plugin)) {
      univer.registerPlugin(plugin[0], plugin[1] as never);
    } else {
      univer.registerPlugin(plugin);
    }
  }
}

export async function loadCurrentUser(univer: Univer): Promise<void> {
  const injector = univer.__getInjector();
  const response = await injector
    .get(HTTPService)
    .get<IGetUserResponse>(`${httpProtocol}://${host}/universer-api/user`);
  if (response.body.user) {
    injector.get(UserManagerService).setCurrentUser(response.body.user);
  }
}

export function syncEditorTitle(univer: Univer, unitID: string | null): void {
  if (!unitID) return;
  const instanceService = univer.__getInjector().get(IUniverInstanceService);
  let nameSubscription: { unsubscribe(): void } | undefined;
  const updateTitle = (name: string) => {
    const title = document.querySelector<HTMLElement>("#editor-title");
    const label = title?.querySelector<HTMLElement>("span") ?? title;
    if (label) label.textContent = name;
    document.title = `${name} · Univer`;
  };
  const bind = (unit: UnitModel) => {
    nameSubscription?.unsubscribe();
    nameSubscription = unit.name$.subscribe(updateTitle);
  };
  const existing = instanceService.getUnit(unitID);
  if (existing) bind(existing);
  const unitAddedSubscription = instanceService.unitAdded$.subscribe(
    ({ unit }) => {
      if (unit.getUnitId() === unitID) bind(unit);
    }
  );
  univer.onDispose(() => {
    unitAddedSubscription.unsubscribe();
    nameSubscription?.unsubscribe();
  });
}
