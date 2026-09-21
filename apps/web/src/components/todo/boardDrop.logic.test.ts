import { assert, describe, it } from "vite-plus/test";

import {
  boardDispatchProgress,
  boardStatusRollup,
  BOARD_NEW_TASK_DISPATCH_KEY,
  BOARD_PIPELINE_STEPS,
  composeBoardDispatchPrompt,
  composeBoardNewTaskPrompt,
  composeBoardNewTaskTitle,
  resolveBoardDropAction,
  type BoardDropAction,
} from "./boardDrop.logic";

function assertAction(actual: BoardDropAction, expected: BoardDropAction) {
  assert.deepEqual(actual, expected);
}

describe("drop to action mapping", () => {
  it("maps a Read column drop at both speeds to a read dispatch", () => {
    assertAction(resolveBoardDropAction("backlog", "read", "confirm"), {
      kind: "dispatch",
      mode: "read",
    });
    assertAction(resolveBoardDropAction("blocked", "read", "now"), {
      kind: "dispatch",
      mode: "read",
    });
  });

  it("maps a Doing column drop at both speeds to a do dispatch", () => {
    assertAction(resolveBoardDropAction("backlog", "doing", "confirm"), {
      kind: "dispatch",
      mode: "doing",
    });
    assertAction(resolveBoardDropAction("done", "doing", "now"), {
      kind: "dispatch",
      mode: "doing",
    });
  });

  it("maps closed-status targets to a plain status write at both speeds", () => {
    for (const speed of ["confirm", "now"] as const) {
      assertAction(resolveBoardDropAction("backlog", "done", speed), {
        kind: "status",
        status: "done",
      });
      assertAction(resolveBoardDropAction("doing", "cancelled", speed), {
        kind: "status",
        status: "cancelled",
      });
      assertAction(resolveBoardDropAction("read", "blocked", speed), {
        kind: "status",
        status: "blocked",
      });
    }
  });

  it("maps unknown and retired statuses to a status write carrying that status", () => {
    assertAction(resolveBoardDropAction("backlog", "queued-forever", "confirm"), {
      kind: "status",
      status: "queued-forever",
    });
    assertAction(resolveBoardDropAction("backlog", "in progress", "now"), {
      kind: "status",
      status: "in progress",
    });
  });

  it("keeps the escape hatch a status write even for Read and Doing targets", () => {
    assertAction(resolveBoardDropAction("backlog", "read", "status-only"), {
      kind: "status",
      status: "read",
    });
    assertAction(resolveBoardDropAction("blocked", "doing", "status-only"), {
      kind: "status",
      status: "doing",
    });
  });

  it("treats a Delegated column drop as a no-op at every speed", () => {
    for (const speed of ["confirm", "now", "status-only"] as const) {
      assertAction(resolveBoardDropAction("backlog", "delegated", speed), { kind: "noop" });
      assertAction(resolveBoardDropAction("doing", "delegated", speed), { kind: "noop" });
    }
  });

  it("treats a same-column drop as a no-op at every speed", () => {
    for (const speed of ["confirm", "now", "status-only"] as const) {
      assertAction(resolveBoardDropAction("done", "done", speed), { kind: "noop" });
      assertAction(resolveBoardDropAction("read", "read", speed), { kind: "noop" });
    }
  });
});

describe("dispatch prompt composition", () => {
  it("composes the read verb for a Read drop", () => {
    assert.equal(composeBoardDispatchPrompt("5d03e", "read", null), "/todo -read 5d03e");
  });

  it("composes the do verb for a Doing drop", () => {
    assert.equal(composeBoardDispatchPrompt("5d03e", "doing", null), "/todo -do 5d03e");
  });

  it("rides notes as plain trailing user text", () => {
    assert.equal(
      composeBoardDispatchPrompt("5d03e", "doing", " focus on the sidebar first "),
      "/todo -do 5d03e\n\nfocus on the sidebar first",
    );
  });

  it("treats blank notes as no notes", () => {
    assert.equal(composeBoardDispatchPrompt("5d03e", "read", "   "), "/todo -read 5d03e");
  });

  it("stays provider-agnostic user text with no harness framing", () => {
    const prompt = composeBoardDispatchPrompt("5d03e", "doing", "keep it minimal");
    assert.ok(!prompt.toLowerCase().includes("claude"));
    assert.ok(!prompt.toLowerCase().includes("agent tool"));
  });
});

describe("new task prompt composition", () => {
  it("composes a bare /todo new prompt carrying the idea", () => {
    assert.equal(
      composeBoardNewTaskPrompt("Add a retry button to the login form"),
      "/todo new\n\nAdd a retry button to the login form",
    );
  });

  it("trims surrounding whitespace from the idea", () => {
    assert.equal(
      composeBoardNewTaskPrompt("  fix the flaky map test  "),
      "/todo new\n\nfix the flaky map test",
    );
  });

  it("rides optional placement hints as plain trailing lines", () => {
    assert.equal(
      composeBoardNewTaskPrompt("Add a retry button", { column: "doing", tag: "api" }),
      "/todo new\n\nAdd a retry button\n\ncolumn: doing\ntag: api",
    );
  });

  it("composes hints independently when only one is set", () => {
    assert.equal(
      composeBoardNewTaskPrompt("Add a retry button", { column: null, tag: "api" }),
      "/todo new\n\nAdd a retry button\n\ntag: api",
    );
    assert.equal(
      composeBoardNewTaskPrompt("Add a retry button", { column: "read" }),
      "/todo new\n\nAdd a retry button\n\ncolumn: read",
    );
  });

  it("rejects an empty or whitespace-only idea", () => {
    assert.equal(composeBoardNewTaskPrompt(""), null);
    assert.equal(composeBoardNewTaskPrompt("   \n\t  "), null);
  });

  it("ignores blank hint values", () => {
    assert.equal(
      composeBoardNewTaskPrompt("Add a retry button", { column: "   ", tag: "" }),
      "/todo new\n\nAdd a retry button",
    );
  });

  it("stays provider-agnostic user text with no harness framing", () => {
    const prompt = composeBoardNewTaskPrompt("Add a retry button", { column: "doing" });
    assert.ok(!prompt!.toLowerCase().includes("claude"));
    assert.ok(!prompt!.toLowerCase().includes("agent tool"));
  });

  it("exposes the synthetic dispatch key used while the ticket does not exist", () => {
    assert.equal(BOARD_NEW_TASK_DISPATCH_KEY, "__new__");
  });
});

describe("new task thread title composition", () => {
  it("titles the thread from the idea text", () => {
    assert.equal(composeBoardNewTaskTitle("  Add a retry button  "), "Add a retry button");
  });

  it("truncates a long idea to a bounded title", () => {
    const idea = "a".repeat(100);
    const title = composeBoardNewTaskTitle(idea);
    assert.ok(title.length <= 60);
    assert.equal(title, "a".repeat(60));
  });

  it("flattens a multi-line idea to a single-line title", () => {
    const idea = "Add a\n\nretry\tbutton\nwith tests";
    assert.equal(composeBoardNewTaskTitle(idea), "Add a retry button with tests");
  });

  it("falls back to a fixed title for a blank idea", () => {
    assert.equal(composeBoardNewTaskTitle("   "), "todo new");
  });
});

describe("dispatch pipeline steps", () => {
  it("names the actioning pipeline stages in order", () => {
    assert.deepEqual(BOARD_PIPELINE_STEPS, [
      "investigate",
      "implement",
      "verify",
      "review",
      "honesty",
    ]);
  });
});

describe("status drop rollup", () => {
  const child = { id: "5d03e", parentId: "81e2d", status: "doing" };
  const root = { id: "81e2d", parentId: null, status: "doing" };

  it("proposes a rollup when a child drops to done", () => {
    assert.deepEqual(boardStatusRollup(child, "done"), {
      status: "done",
      text: "Dropped to done from the board",
    });
  });

  it("proposes a rollup when a child drops to cancelled", () => {
    assert.deepEqual(boardStatusRollup(child, "cancelled"), {
      status: "cancelled",
      text: "Dropped to cancelled from the board",
    });
  });

  it("never rolls up an open status, whatever the depth", () => {
    assert.equal(boardStatusRollup(child, "read"), null);
    assert.equal(boardStatusRollup(child, "blocked"), null);
  });

  it("never rolls up an issue without a parent", () => {
    assert.equal(boardStatusRollup(root, "done"), null);
    assert.equal(boardStatusRollup(root, "cancelled"), null);
  });
});

describe("dispatch progress from a thread snapshot", () => {
  it("reports starting while the thread has not materialised yet", () => {
    assert.equal(boardDispatchProgress(undefined), "starting");
    assert.equal(boardDispatchProgress(null), "starting");
  });

  it("reports running while the session is starting or running", () => {
    assert.equal(
      boardDispatchProgress({ session: { status: "starting" }, latestTurn: null }),
      "running",
    );
    assert.equal(
      boardDispatchProgress({
        session: { status: "running" },
        latestTurn: { state: "running" },
      }),
      "running",
    );
    assert.equal(
      boardDispatchProgress({
        session: { status: "idle" },
        latestTurn: { state: "running" },
      }),
      "running",
    );
  });

  it("reports settled once the turn and session are done", () => {
    assert.equal(
      boardDispatchProgress({
        session: { status: "idle" },
        latestTurn: { state: "completed" },
      }),
      "settled",
    );
    assert.equal(
      boardDispatchProgress({
        session: { status: "stopped" },
        latestTurn: { state: "error" },
      }),
      "settled",
    );
    assert.equal(boardDispatchProgress({ session: null, latestTurn: null }), "settled");
  });
});
