import { CommandType } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import { shouldCancelReadOnlyReviewCommand } from "../src/read-only-review.js";

describe("Worktree read-only review", () => {
  it("allows viewport commands such as wheel scrolling", () => {
    expect(
      shouldCancelReadOnlyReviewCommand({
        id: "sheet.command.set-scroll-relative",
        type: CommandType.COMMAND,
      })
    ).toBe(false);
  });

  it("blocks local data mutations", () => {
    expect(
      shouldCancelReadOnlyReviewCommand({
        id: "sheet.mutation.set-range-values",
        type: CommandType.MUTATION,
      })
    ).toBe(true);
  });

  it("allows collaboration mutations to update the preview", () => {
    expect(
      shouldCancelReadOnlyReviewCommand({
        id: "sheet.mutation.set-range-values",
        type: CommandType.MUTATION,
        options: { fromCollab: true },
      })
    ).toBe(false);
  });
});
