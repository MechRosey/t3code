import * as Cause from "effect/Cause";

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
