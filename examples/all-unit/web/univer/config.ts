/** The example server mounts every Endpoint under this prefix; see `server/main.ts`. */
export const API_BASE_URL = `${location.protocol}//${location.host}/universer-api`;
const DOWNLOAD_ENDPOINT_URL = `${location.protocol}//${location.host}/`;

export const collaborationClientConfig = {
  sendChangesetTimeout: 200,
  authzUrl: `${API_BASE_URL}/authz`,
  snapshotServerUrl: `${API_BASE_URL}/snapshot`,
  collabSubmitChangesetUrl: `${API_BASE_URL}/comb`,
  collabWebSocketUrl: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/universer-api/comb/connect`,
  wsSessionTicketUrl: `${API_BASE_URL}/user/session-ticket`,
  // Images and attachments are uploaded through the File Endpoint.
  uploadFileServerUrl: `${API_BASE_URL}/stream/file/upload`,
  signUrlServerUrl: `${API_BASE_URL}/file/{fileID}/sign-url`,
  downloadEndpointUrl: DOWNLOAD_ENDPOINT_URL,
};

export const exchangeClientConfig = {
  uploadFileServerUrl: `${API_BASE_URL}/stream/file/upload`,
  getTaskServerUrl: `${API_BASE_URL}/exchange/task/{taskID}`,
  signUrlServerUrl: `${API_BASE_URL}/file/{fileID}/sign-url`,
  importServerUrl: `${API_BASE_URL}/exchange/{type}/import`,
  exportServerUrl: `${API_BASE_URL}/exchange/{type}/export`,
  downloadEndpointUrl: DOWNLOAD_ENDPOINT_URL,
};

/** The history viewer mounts inside the editor container. */
export function historyConfig(container: string) {
  return { historyServerUrl: `${API_BASE_URL}/history`, univerContainerId: container };
}
