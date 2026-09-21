import { TodoBoardError } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { describe, expect, it } from "vite-plus/test";

import { boardFailureMessage, classifyBoardFailure } from "./boardStatus";

describe("board failure classification", () => {
  it("recognises a board that does not resolve", () => {
    expect(
      classifyBoardFailure(
        Cause.fail(
          new TodoBoardError({
            failure: "board_not_found",
            message: "No .todo board resolves here.",
          }),
        ),
      ),
    ).toBe("board_not_found");
  });

  it("treats every other board error as unavailable", () => {
    expect(
      classifyBoardFailure(
        Cause.fail(
          new TodoBoardError({ failure: "cwd_not_directory", message: "cwd is not a directory" }),
        ),
      ),
    ).toBe("unavailable");
  });

  it("treats transport failures and defects as unavailable", () => {
    expect(classifyBoardFailure(Cause.fail(new Error("socket closed")))).toBe("unavailable");
    expect(classifyBoardFailure(Cause.die(new Error("boom")))).toBe("unavailable");
  });
});

describe("board failure message", () => {
  it("keeps the server's message when there is one", () => {
    expect(
      boardFailureMessage(
        Cause.fail(new TodoBoardError({ failure: "board_not_found", message: "No board." })),
      ),
    ).toBe("No board.");
  });

  it("falls back to a generic message", () => {
    expect(boardFailureMessage(Cause.fail(new Error("")))).toBe("The environment request failed.");
  });
});
