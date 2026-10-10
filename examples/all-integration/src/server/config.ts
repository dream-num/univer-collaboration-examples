export const config = {
  databaseFilename: process.env.DATABASE_FILENAME ?? ".data/collaboration.sqlite",
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3015),
} as const;
