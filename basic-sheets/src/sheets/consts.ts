// 与 univer-pro/examples/src/sheets 一致，Unit 由 URL 参数驱动加载。
export const host = window.location.host;
export const isSecure = window.location.protocol === "https:";
export const httpProtocol = isSecure ? "https" : "http";
export const wsProtocol = isSecure ? "wss" : "ws";

export const url = new URL(window.location.href);
export const unit = url.searchParams.get("unit");
