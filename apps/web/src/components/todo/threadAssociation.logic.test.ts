import type { ThreadId } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import {
  BOARD_DISPATCH_ACTOR,
  composeThreadAssociationComment,
  parseThreadAssociationRecords,
  resolveThreadAssociation,
} from "./threadAssociation.logic";

const THREAD_ONE = "6f1d2c3a-1111-4222-8333-444455556666" as ThreadId;
const THREAD_TWO = "0a9b8c7d-aaaa-4bbb-8ccc-ddddeeeffff" as ThreadId;
const THREAD_THREE = "55554444-3333-4222-8111-000999888777" as ThreadId;

function logEntry(stamp: string, text: string, by?: string): string {
  return by === undefined ? `- **${stamp}** ${text}` : `- **${stamp}** [${by}] ${text}`;
}

function logBody(entries: ReadonlyArray<string>): string {
  return ["# ticket body", "", "## Log", "", ...entries].join("\n");
}

describe("association comment composition", () => {
  it("composes the do verb for a doing dispatch", () => {
    assert.equal(
      composeThreadAssociationComment(THREAD_ONE, "doing"),
      `dispatched thread ${THREAD_ONE} (-do)`,
    );
  });

  it("composes the read verb for a read dispatch", () => {
    assert.equal(
      composeThreadAssociationComment(THREAD_ONE, "read"),
      `dispatched thread ${THREAD_ONE} (-read)`,
    );
  });

  it("stays a single line so the newline-flatten rule cannot mangle it", () => {
    for (const mode of ["doing", "read"] as const) {
      const text = composeThreadAssociationComment(THREAD_ONE, mode);
      assert.ok(!text.includes("\n"));
      assert.ok(!text.includes("\r"));
    }
  });

  it("names the machine actor used when recording the comment", () => {
    assert.equal(BOARD_DISPATCH_ACTOR, "t3 board");
  });
});

describe("association comment round-trip", () => {
  it("recovers the same thread and mode from the applied Log entry", () => {
    for (const mode of ["doing", "read"] as const) {
      const text = composeThreadAssociationComment(THREAD_ONE, mode);
      const body = logBody([logEntry("2026-09-21 02:30", text, BOARD_DISPATCH_ACTOR)]);
      assert.deepEqual(resolveThreadAssociation(body), { threadId: THREAD_ONE, mode });
    }
  });

  it("parses entries with and without the actor clause", () => {
    const body = logBody([
      logEntry("2026-09-21 02:30", `dispatched thread ${THREAD_ONE} (-do)`, BOARD_DISPATCH_ACTOR),
      logEntry("2026-09-21 02:31", `dispatched thread ${THREAD_TWO} (-read)`),
    ]);
    assert.deepEqual(parseThreadAssociationRecords(body), [
      { threadId: THREAD_ONE, mode: "doing" },
      { threadId: THREAD_TWO, mode: "read" },
    ]);
  });
});

describe("association tolerance", () => {
  it("ignores unrelated Log entries around the association", () => {
    const body = logBody([
      logEntry("2026-09-21 01:49", "READ-COMPLETE (agent ses_x, model m, effort low)"),
      logEntry("2026-09-21 02:30", `dispatched thread ${THREAD_ONE} (-do)`, BOARD_DISPATCH_ACTOR),
      logEntry("2026-09-21 02:35", "GREEN: 12 tests, 0 failed"),
      "- child ebb5a (diff view) done: landed",
    ]);
    assert.deepEqual(resolveThreadAssociation(body), { threadId: THREAD_ONE, mode: "doing" });
  });

  it("ignores malformed and lookalike lines instead of guessing", () => {
    const body = logBody([
      logEntry("2026-09-21 02:30", "dispatched thread  (-do)"),
      logEntry("2026-09-21 02:31", "dispatched thread " + THREAD_ONE),
      logEntry("2026-09-21 02:32", `dispatched thread ${THREAD_ONE} (-delete)`),
      logEntry("2026-09-21 02:33", `DISPATCHED THREAD ${THREAD_TWO} (-do)`),
      `> dispatched thread ${THREAD_THREE} (-do)`,
      `dispatched thread ${THREAD_THREE} (-do)`,
    ]);
    assert.deepEqual(parseThreadAssociationRecords(body), []);
    assert.equal(resolveThreadAssociation(body), null);
  });
});

describe("association pick rule", () => {
  it("prefers the latest do thread over any read thread", () => {
    const body = logBody([
      logEntry("2026-09-21 02:30", `dispatched thread ${THREAD_ONE} (-do)`, BOARD_DISPATCH_ACTOR),
      logEntry("2026-09-21 02:40", `dispatched thread ${THREAD_TWO} (-read)`, BOARD_DISPATCH_ACTOR),
      logEntry(
        "2026-09-21 02:50",
        `dispatched thread ${THREAD_THREE} (-read)`,
        BOARD_DISPATCH_ACTOR,
      ),
    ]);
    assert.deepEqual(resolveThreadAssociation(body), { threadId: THREAD_ONE, mode: "doing" });
  });

  it("picks the latest do thread when the ticket was re-dispatched", () => {
    const body = logBody([
      logEntry("2026-09-21 02:30", `dispatched thread ${THREAD_ONE} (-do)`, BOARD_DISPATCH_ACTOR),
      logEntry("2026-09-21 03:30", `dispatched thread ${THREAD_TWO} (-do)`, BOARD_DISPATCH_ACTOR),
    ]);
    assert.deepEqual(resolveThreadAssociation(body), { threadId: THREAD_TWO, mode: "doing" });
  });

  it("falls back to the latest read thread when no do dispatch exists", () => {
    const body = logBody([
      logEntry("2026-09-21 02:30", `dispatched thread ${THREAD_ONE} (-read)`, BOARD_DISPATCH_ACTOR),
      logEntry("2026-09-21 02:40", `dispatched thread ${THREAD_TWO} (-read)`, BOARD_DISPATCH_ACTOR),
    ]);
    assert.deepEqual(resolveThreadAssociation(body), { threadId: THREAD_TWO, mode: "read" });
  });

  it("returns null when nothing is recorded", () => {
    assert.equal(resolveThreadAssociation(""), null);
    assert.equal(resolveThreadAssociation("# no log section at all"), null);
    assert.equal(
      resolveThreadAssociation(logBody([logEntry("2026-09-21 01:49", "READ-COMPLETE")])),
      null,
    );
  });
});
