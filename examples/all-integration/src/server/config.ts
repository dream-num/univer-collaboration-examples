export const config = {
  // 保留更名前的文件名，避免示例更名后读不到已有本地数据。
  databaseFilename: process.env.DATABASE_FILENAME ?? ".data/office-app.sqlite",
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3015),
} as const;
