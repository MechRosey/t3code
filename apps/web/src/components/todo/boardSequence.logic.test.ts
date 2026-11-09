import type { TodoIssue } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import {
  buildSequenceStrip,
  displayedSequence,
  removeFromSequence,
  resolveSequenceDrop,
  sequenceChipDragId,
  SEQUENCE_STRIP_DROP_ID,
  type SequenceDropOutcome,
} from "./boardSequence.logic";

function issue(id: string, status: string, overrides: Partial<TodoIssue> = {}): TodoIssue {
  return {
    id,
    title: `Title of ${id}`,
    status,
    created: "2026-09-01T00:00:00.000Z",
    updated: "2026-09-01T00:00:00.000Z",
    tags: [],
    epic: null,
    parentId: null,
    depth: 0,
    rootHue: null,
    markerPath: `.todo/${id}/${id}.md`,
    archived: false,
    sections: {
      brief: { content: false, text: "" },
      reading: { content: false, marker: false },
      doing: { content: false, marker: false },
      log: { content: false },
      openQuestions: { content: false, hasOpen: false, hasHumanOpen: false },
    },
    body: "",
    links: { blocks: [], relates: [] },
    ...overrides,
  };
}

const DOING_OLD = "a0001-doing-old";
const DOING_NEW = "a0002-doing-new";
const READ_PLANNED = "c0001-read-planned";
const BACKLOG_PLANNED = "d0001-backlog-planned";
const BLOCKED_PLANNED = "e0001-blocked-planned";
const DONE = "f0001-done";
const CANCELLED = "g0001-cancelled";
const ARCHIVED_READ = "h0001-archived-read";
const ARCHIVED_DOING = "i0001-archived-doing";
const READ_UNPLANNED = "r0001-read-unplanned";
const BACKLOG_UNPLANNED = "k0001-backlog-unplanned";
const UNKNOWN = "x0001-unknown";
const UI_TAG = "ui";

const ISSUES: ReadonlyArray<TodoIssue> = [
  issue(DOING_OLD, "doing", { updated: "2026-09-01T00:00:00.000Z" }),
  issue(DOING_NEW, "doing", { updated: "2026-09-03T00:00:00.000Z", tags: [UI_TAG] }),
  issue(READ_PLANNED, "read", { tags: [UI_TAG] }),
  issue(BACKLOG_PLANNED, "backlog"),
  issue(BLOCKED_PLANNED, "blocked"),
  issue(DONE, "done"),
  issue(CANCELLED, "cancelled"),
  issue(ARCHIVED_READ, "read", { archived: true }),
  issue(ARCHIVED_DOING, "doing", { archived: true }),
  issue(READ_UNPLANNED, "read"),
  issue(BACKLOG_UNPLANNED, "backlog"),
];

const ISSUES_BY_ID = new Map(ISSUES.map((entry) => [entry.id, entry] as const));

const matchesEverything = () => true;
const matchesUiTag = (candidate: TodoIssue) => candidate.tags.includes(UI_TAG);

const chipIds = (chips: ReadonlyArray<{ readonly id: string }>) => chips.map((chip) => chip.id);

describe("buildSequenceStrip", () => {
  it("buildSequenceStrip_MixedBoard_DoingByMostRecentUpdateAndNextInFileOrderOfOpenTickets", () => {
    const sequence = [
      BACKLOG_PLANNED,
      DOING_OLD,
      DONE,
      READ_PLANNED,
      UNKNOWN,
      BLOCKED_PLANNED,
      ARCHIVED_READ,
      CANCELLED,
    ];

    const strip = buildSequenceStrip(ISSUES, sequence, matchesEverything);

    assert.deepEqual(chipIds(strip.doing), [DOING_NEW, DOING_OLD]);
    assert.deepEqual(chipIds(strip.next), [BACKLOG_PLANNED, READ_PLANNED, BLOCKED_PLANNED]);
    assert.deepEqual(strip.next[1], {
      id: READ_PLANNED,
      shortId: "c0001",
      title: `Title of ${READ_PLANNED}`,
      status: "read",
      matches: true,
    });
  });

  it("buildSequenceStrip_FilterActive_KeepsEveryChipAndOnlyFlagsTheMatches", () => {
    const sequence = [BACKLOG_PLANNED, READ_PLANNED, BLOCKED_PLANNED];

    const unfiltered = buildSequenceStrip(ISSUES, sequence, matchesEverything);
    const filtered = buildSequenceStrip(ISSUES, sequence, matchesUiTag);

    assert.deepEqual(chipIds(filtered.doing), chipIds(unfiltered.doing));
    assert.deepEqual(chipIds(filtered.next), chipIds(unfiltered.next));
    assert.deepEqual(
      filtered.doing.map((chip) => chip.matches),
      [true, false],
    );
    assert.deepEqual(
      filtered.next.map((chip) => chip.matches),
      [false, true, false],
    );
  });
});

describe("resolveSequenceDrop", () => {
  it("resolveSequenceDrop_EachDragAndTarget_ReturnsTheFullOrderToSendOrNoop", () => {
    const sequence = [BACKLOG_PLANNED, DOING_OLD, READ_PLANNED, BLOCKED_PLANNED];
    const strip = buildSequenceStrip(ISSUES, sequence, matchesEverything);
    const card = (id: string) => `card:${id}`;
    const chip = sequenceChipDragId;
    const send = (ids: ReadonlyArray<string> | null): SequenceDropOutcome => ({
      kind: "sequence",
      ids,
    });
    const board: SequenceDropOutcome = { kind: "board" };
    const cases: ReadonlyArray<{
      readonly name: string;
      readonly activeId: string;
      readonly overId: string;
      readonly expected: SequenceDropOutcome;
    }> = [
      {
        name: "new card on the strip appends",
        activeId: card(READ_UNPLANNED),
        overId: SEQUENCE_STRIP_DROP_ID,
        expected: send([...sequence, READ_UNPLANNED]),
      },
      {
        name: "new card on a chip inserts before it",
        activeId: card(READ_UNPLANNED),
        overId: chip(READ_PLANNED),
        expected: send([BACKLOG_PLANNED, DOING_OLD, READ_UNPLANNED, READ_PLANNED, BLOCKED_PLANNED]),
      },
      {
        name: "backlog card on the first chip goes first",
        activeId: card(BACKLOG_UNPLANNED),
        overId: chip(BACKLOG_PLANNED),
        expected: send([BACKLOG_UNPLANNED, ...sequence]),
      },
      {
        name: "planned card on an earlier chip moves instead of duplicating",
        activeId: card(BLOCKED_PLANNED),
        overId: chip(BACKLOG_PLANNED),
        expected: send([BLOCKED_PLANNED, BACKLOG_PLANNED, DOING_OLD, READ_PLANNED]),
      },
      {
        name: "planned card on the strip moves to the end",
        activeId: card(BACKLOG_PLANNED),
        overId: SEQUENCE_STRIP_DROP_ID,
        expected: send([DOING_OLD, READ_PLANNED, BLOCKED_PLANNED, BACKLOG_PLANNED]),
      },
      {
        name: "last planned card on the strip is a noop",
        activeId: card(BLOCKED_PLANNED),
        overId: SEQUENCE_STRIP_DROP_ID,
        expected: send(null),
      },
      {
        name: "planned card on its own chip is a noop",
        activeId: card(READ_PLANNED),
        overId: chip(READ_PLANNED),
        expected: send(null),
      },
      {
        name: "doing card is ignored",
        activeId: card(DOING_NEW),
        overId: SEQUENCE_STRIP_DROP_ID,
        expected: send(null),
      },
      {
        name: "done card is ignored",
        activeId: card(DONE),
        overId: SEQUENCE_STRIP_DROP_ID,
        expected: send(null),
      },
      {
        name: "cancelled card is ignored",
        activeId: card(CANCELLED),
        overId: chip(READ_PLANNED),
        expected: send(null),
      },
      {
        name: "archived card is ignored",
        activeId: card(ARCHIVED_READ),
        overId: SEQUENCE_STRIP_DROP_ID,
        expected: send(null),
      },
      {
        name: "chip moved left takes the target slot and doing ids keep theirs",
        activeId: chip(BLOCKED_PLANNED),
        overId: chip(BACKLOG_PLANNED),
        expected: send([BLOCKED_PLANNED, DOING_OLD, BACKLOG_PLANNED, READ_PLANNED]),
      },
      {
        name: "chip moved right takes the target slot",
        activeId: chip(BACKLOG_PLANNED),
        overId: chip(BLOCKED_PLANNED),
        expected: send([READ_PLANNED, DOING_OLD, BLOCKED_PLANNED, BACKLOG_PLANNED]),
      },
      {
        name: "chip on the strip moves to the end",
        activeId: chip(READ_PLANNED),
        overId: SEQUENCE_STRIP_DROP_ID,
        expected: send([BACKLOG_PLANNED, DOING_OLD, BLOCKED_PLANNED, READ_PLANNED]),
      },
      {
        name: "chip on itself is a noop",
        activeId: chip(BACKLOG_PLANNED),
        overId: chip(BACKLOG_PLANNED),
        expected: send(null),
      },
      {
        name: "chip on a column never changes status",
        activeId: chip(READ_PLANNED),
        overId: "column:doing",
        expected: send(null),
      },
      {
        name: "card on a column stays a board drop",
        activeId: card(READ_UNPLANNED),
        overId: "column:doing",
        expected: board,
      },
      {
        name: "card on an action-now target stays a board drop",
        activeId: card(READ_PLANNED),
        overId: "dispatch:doing",
        expected: board,
      },
    ];

    for (const { name, activeId, overId, expected } of cases) {
      const outcome = resolveSequenceDrop({
        activeId,
        overId,
        sequence,
        strip,
        issuesById: ISSUES_BY_ID,
      });
      assert.deepEqual(outcome, expected, name);
    }
  });

  it("removeFromSequence_PlannedOrAbsentId_ReturnsTheOrderWithoutIt", () => {
    const sequence = [BACKLOG_PLANNED, DOING_OLD, READ_PLANNED];

    assert.deepEqual(removeFromSequence(sequence, READ_PLANNED), [BACKLOG_PLANNED, DOING_OLD]);
    assert.deepEqual(removeFromSequence(sequence, UNKNOWN), sequence);
  });
});

describe("displayedSequence", () => {
  it("displayedSequence_PendingWrite_ShowsItUntilTheSnapshotSequenceChanges", () => {
    const snapshotSequence = [BACKLOG_PLANNED, READ_PLANNED];
    const pending = { base: snapshotSequence, ids: [READ_PLANNED, BACKLOG_PLANNED] };
    const nextSnapshotSequence = [READ_PLANNED, BACKLOG_PLANNED];

    assert.strictEqual(displayedSequence(snapshotSequence, null), snapshotSequence);
    assert.strictEqual(displayedSequence(snapshotSequence, pending), pending.ids);
    assert.strictEqual(displayedSequence(nextSnapshotSequence, pending), nextSnapshotSequence);
  });
});
