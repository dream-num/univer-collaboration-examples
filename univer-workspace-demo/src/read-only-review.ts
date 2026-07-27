import { CommandType } from "@univerjs/core";

export interface ReadOnlyReviewCommand {
  readonly id: string;
  readonly type: CommandType;
  readonly options?: {
    readonly fromCollab?: boolean;
    readonly fromChangeset?: boolean;
  };
}

export function shouldCancelReadOnlyReviewCommand(
  command: ReadOnlyReviewCommand
): boolean {
  if (command.options?.fromCollab || command.options?.fromChangeset) {
    return false;
  }
  return command.type === CommandType.MUTATION;
}
