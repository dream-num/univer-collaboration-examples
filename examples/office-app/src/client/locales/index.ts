import type { Locale } from "../../shared/api-types";
import { enUS } from "./en-US";
import { zhCN } from "./zh-CN";

export const messages = {
  "zh-CN": zhCN,
  "en-US": enUS,
} satisfies Record<Locale, typeof enUS>;
