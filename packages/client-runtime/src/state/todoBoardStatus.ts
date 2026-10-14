import { TodoBoardError } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";

const isTodoBoardError = Schema.is(TodoBoardError);

export type TodoBoardLoadState = "bootstrap" | "unavailable";

export function classifyTodoBoardFailure(cause: Cause.Cause<unknown>): TodoBoardLoadState {
  try {
    const error = Cause.squash(cause);
    return isTodoBoardError(error) && error.failure === "board_not_found"
      ? "bootstrap"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}
