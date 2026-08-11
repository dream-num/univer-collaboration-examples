import { LocaleType, LogLevel } from "@univerjs/core";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import CollaborationClientEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import CollaborationClientUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import {
  createUniver,
  defaultTheme,
  mergeLocales,
} from "@univerjs/presets";

import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs-pro/collaboration-client-ui/lib/index.css";

const httpProtocol = window.location.protocol === "https:" ? "https" : "http";
const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
const baseURL = `${httpProtocol}://${window.location.host}/universer-api`;

createUniver({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(
      UniverPresetSheetsCoreEnUS,
      CollaborationClientEnUS,
      CollaborationClientUIEnUS
    ),
  },
  theme: defaultTheme,
  logLevel: LogLevel.WARN,
  collaboration: true,
  presets: [UniverSheetsCorePreset({ container: "app" })],
  plugins: [
    [
      UniverLicensePlugin,
      { license: import.meta.env.VITE_UNIVER_LICENSE || undefined },
    ],
    // 提供 OT、revision 和协同数据模型。
    UniverCollaborationPlugin,
    // 负责加载、提交以及维护实时连接。
    [
      UniverCollaborationClientPlugin,
      {
        // 使用浏览器原生 WebSocket 建立实时通道。
        socketService: BrowserCollaborationSocketService,
        // 查询前端按钮和编辑状态；不能替代服务端 ACL。
        authzUrl: `${baseURL}/authz`,
        // 通过 HTTP 加载 snapshot、blocks 和缺失 changesets。
        snapshotServerUrl: `${baseURL}/snapshot`,
        // 通过 HTTP 提交本地 changeset，并接收完整提交结果。
        collabSubmitChangesetUrl: `${baseURL}/comb`,
        // 接收成员、光标和 changeset 广播。
        collabWebSocketUrl: `${wsProtocol}://${window.location.host}/universer-api/comb/connect`,
        // 建立 WebSocket 前获取一次性身份 ticket。
        wsSessionTicketUrl: `${baseURL}/user/session-ticket`,
      },
    ],
    // 展示在线成员、光标和协同状态。
    UniverCollaborationClientUIPlugin,
  ],
});
