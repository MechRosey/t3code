import { TodoBoardError } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";

const isTodoBoardError = Schema.is(TodoBoardError);

export type BoardReadFailure = "board_not_found" | "unavailable";

export function classifyBoardFailure(cause: Cause.Cause<unknown>): BoardReadFailure {
  try {
    const error = Cause.squash(cause);
    return isTodoBoardError(error) && error.failure === "board_not_found"
      ? "board_not_found"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

export function boardFailureMessage(cause: Cause.Cause<unknown>): string {
  try {
    const error = Cause.squash(cause);
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
  } catch {
    return "The environment request failed.";
  }
  return "The environment request failed.";
}
