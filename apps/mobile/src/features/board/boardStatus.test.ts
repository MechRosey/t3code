import { TodoBoardError } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { describe, expect, it } from "vite-plus/test";

import { boardFailureMessage } from "./boardStatus";

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
