export const config = {
  databaseFilename: ".data/office-app.sqlite",
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3015),
} as const;
