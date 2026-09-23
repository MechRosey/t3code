import { TodoBoardError } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { describe, expect, it } from "vite-plus/test";

import { classifyTodoBoardFailure } from "./todoBoardStatus.ts";

describe("todo board failure classification", () => {
  it("maps a missing board to the bootstrap state", () => {
    expect(
      classifyTodoBoardFailure(
        Cause.fail(
          new TodoBoardError({
            failure: "board_not_found",
            message: "No .todo board resolves here.",
          }),
        ),
      ),
    ).toBe("bootstrap");
  });

  it("keeps every other board failure literal in the dead-end state", () => {
    expect(
      classifyTodoBoardFailure(
        Cause.fail(
          new TodoBoardError({ failure: "cwd_not_directory", message: "cwd is not a directory" }),
        ),
      ),
    ).toBe("unavailable");
    expect(
      classifyTodoBoardFailure(
        Cause.fail(new TodoBoardError({ failure: "operation_failed", message: "disk gone" })),
      ),
    ).toBe("unavailable");
  });

  it("treats transport failures and defects as unavailable", () => {
    expect(classifyTodoBoardFailure(Cause.fail(new Error("socket closed")))).toBe("unavailable");
    expect(classifyTodoBoardFailure(Cause.die(new Error("boom")))).toBe("unavailable");
  });
});
