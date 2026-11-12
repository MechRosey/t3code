import type { TodoIssue } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import {
  activeSequence,
  boardCardDragId,
  boardCardIssueId,
  buildSequenceStrip,
  classifyDrop,
  displayedSequence,
  failPendingWrite,
  pendingWritesFor,
  placeInSequence,
  reconcilePendingWrites,
  removeFromSequence,
  resolveBoardDragEnd,
  resolveSequenceDrop,
  sequenceChipDragId,
  settlePendingWrite,
  startPendingWrite,
  withPendingWrites,
  JOIN_ZONE_END_FRACTION,
  JOIN_ZONE_START_FRACTION,
  SEQUENCE_STRIP_DROP_ID,
  type BoardDragOutcome,
  type ChipDropZone,
  type DropRect,
  type PendingSequenceWrite,
  type PendingWritesByEpic,
  type SequenceDropOutcome,
  type SequencePlacement,
  type SequenceStrip,
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

const slotIds = (strip: SequenceStrip) =>
  strip.next.map((slot) => slot.chips.map((chip) => chip.id));

const group = (...ids: ReadonlyArray<string>) => ids.join(" ");

describe("buildSequenceStrip", () => {
  it("buildSequenceStrip_MixedBoard_ListsOpenTicketsInFileOrderIncludingDoingAndNoDoingSide", () => {
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

    assert.deepEqual(Object.keys(strip), ["next"]);
    assert.deepEqual(slotIds(strip), [
      [BACKLOG_PLANNED],
      [DOING_OLD],
      [READ_PLANNED],
      [BLOCKED_PLANNED],
    ]);
    assert.deepEqual(strip.next[2]?.chips[0], {
      id: READ_PLANNED,
      shortId: "c0001",
      title: `Title of ${READ_PLANNED}`,
      status: "read",
      matches: true,
    });
    assert.strictEqual(strip.next[1]?.chips[0]?.status, "doing");
  });

  it("buildSequenceStrip_GroupEntries_GroupsOpenMembersAndCollapsesOrDropsTheRest", () => {
    const sequence = [
      group(READ_PLANNED, DONE, BLOCKED_PLANNED),
      group(DOING_OLD, CANCELLED),
      group(DONE, UNKNOWN),
      group(BACKLOG_PLANNED, READ_PLANNED),
    ];

    const strip = buildSequenceStrip(ISSUES, sequence, matchesEverything);

    assert.deepEqual(slotIds(strip), [
      [READ_PLANNED, BLOCKED_PLANNED],
      [DOING_OLD],
      [BACKLOG_PLANNED],
    ]);
  });

  it("buildSequenceStrip_FilterActive_KeepsEveryChipAndOnlyFlagsTheMatches", () => {
    const sequence = [BACKLOG_PLANNED, group(READ_PLANNED, BLOCKED_PLANNED)];

    const unfiltered = buildSequenceStrip(ISSUES, sequence, matchesEverything);
    const filtered = buildSequenceStrip(ISSUES, sequence, matchesUiTag);

    assert.deepEqual(slotIds(filtered), slotIds(unfiltered));
    assert.deepEqual(
      filtered.next.map((slot) => slot.chips.map((chip) => chip.matches)),
      [[false], [true, false]],
    );
  });
});

describe("classifyDrop", () => {
  it("classifyDrop_DraggedCentreAcrossTheTarget_JoinsInTheMiddleThirdAndInsertsOutsideIt", () => {
    const target: DropRect = { left: 100, width: 30 };
    const cases: ReadonlyArray<{ readonly centreX: number; readonly expected: ChipDropZone }> = [
      { centreX: 40, expected: "before" },
      { centreX: 100, expected: "before" },
      { centreX: 109, expected: "before" },
      { centreX: 110, expected: "join" },
      { centreX: 115, expected: "join" },
      { centreX: 119, expected: "join" },
      { centreX: 120, expected: "after" },
      { centreX: 130, expected: "after" },
      { centreX: 400, expected: "after" },
    ];

    for (const { centreX, expected } of cases) {
      assert.strictEqual(classifyDrop(centreX, target), expected, `centre ${centreX}`);
    }
    assert.strictEqual(
      target.left + target.width * JOIN_ZONE_START_FRACTION,
      110,
      "join zone starts a third in",
    );
    assert.strictEqual(
      target.left + target.width * JOIN_ZONE_END_FRACTION,
      120,
      "join zone ends two thirds in",
    );
  });
});

describe("placeInSequence", () => {
  it("placeInSequence_EachMove_GroupsInsertsUngroupsCollapsesAndDedupes", () => {
    const cases: ReadonlyArray<{
      readonly name: string;
      readonly sequence: ReadonlyArray<string>;
      readonly id: string;
      readonly placement: SequencePlacement;
      readonly expected: ReadonlyArray<string>;
    }> = [
      {
        name: "joining a plain entry starts a group of two",
        sequence: [BACKLOG_PLANNED, READ_PLANNED, BLOCKED_PLANNED],
        id: BLOCKED_PLANNED,
        placement: { kind: "join", targetId: BACKLOG_PLANNED },
        expected: [group(BACKLOG_PLANNED, BLOCKED_PLANNED), READ_PLANNED],
      },
      {
        name: "joining a group adds to its end",
        sequence: [group(BACKLOG_PLANNED, READ_PLANNED), BLOCKED_PLANNED],
        id: BLOCKED_PLANNED,
        placement: { kind: "join", targetId: READ_PLANNED },
        expected: [group(BACKLOG_PLANNED, READ_PLANNED, BLOCKED_PLANNED)],
      },
      {
        name: "joining another group leaves a group of one as a plain entry",
        sequence: [group(BACKLOG_PLANNED, READ_PLANNED), BLOCKED_PLANNED, DOING_OLD],
        id: READ_PLANNED,
        placement: { kind: "join", targetId: DOING_OLD },
        expected: [BACKLOG_PLANNED, BLOCKED_PLANNED, group(DOING_OLD, READ_PLANNED)],
      },
      {
        name: "joining its own group changes nothing",
        sequence: [group(BACKLOG_PLANNED, READ_PLANNED)],
        id: BACKLOG_PLANNED,
        placement: { kind: "join", targetId: READ_PLANNED },
        expected: [group(BACKLOG_PLANNED, READ_PLANNED)],
      },
      {
        name: "joining itself changes nothing",
        sequence: [BACKLOG_PLANNED, READ_PLANNED],
        id: READ_PLANNED,
        placement: { kind: "join", targetId: READ_PLANNED },
        expected: [BACKLOG_PLANNED, READ_PLANNED],
      },
      {
        name: "joining an absent ticket changes nothing",
        sequence: [BACKLOG_PLANNED, READ_PLANNED],
        id: READ_PLANNED,
        placement: { kind: "join", targetId: UNKNOWN },
        expected: [BACKLOG_PLANNED, READ_PLANNED],
      },
      {
        name: "a new id joins a group",
        sequence: [BACKLOG_PLANNED],
        id: READ_UNPLANNED,
        placement: { kind: "join", targetId: BACKLOG_PLANNED },
        expected: [group(BACKLOG_PLANNED, READ_UNPLANNED)],
      },
      {
        name: "inserting moves a plain entry",
        sequence: [BACKLOG_PLANNED, READ_PLANNED, BLOCKED_PLANNED],
        id: BLOCKED_PLANNED,
        placement: { kind: "insert", index: 1 },
        expected: [BACKLOG_PLANNED, BLOCKED_PLANNED, READ_PLANNED],
      },
      {
        name: "inserting beside its own group ungroups it",
        sequence: [group(BACKLOG_PLANNED, READ_PLANNED, BLOCKED_PLANNED)],
        id: READ_PLANNED,
        placement: { kind: "insert", index: 1 },
        expected: [group(BACKLOG_PLANNED, BLOCKED_PLANNED), READ_PLANNED],
      },
      {
        name: "dragging the last chip out of a pair collapses it",
        sequence: [DOING_OLD, group(BACKLOG_PLANNED, READ_PLANNED)],
        id: READ_PLANNED,
        placement: { kind: "insert", index: 0 },
        expected: [READ_PLANNED, DOING_OLD, BACKLOG_PLANNED],
      },
      {
        name: "inserting past the end appends",
        sequence: [BACKLOG_PLANNED, READ_PLANNED],
        id: READ_UNPLANNED,
        placement: { kind: "insert", index: 9 },
        expected: [BACKLOG_PLANNED, READ_PLANNED, READ_UNPLANNED],
      },
      {
        name: "duplicates and blank entries go, unknown ids stay",
        sequence: [group(UNKNOWN, BACKLOG_PLANNED), "  ", BACKLOG_PLANNED, READ_PLANNED],
        id: READ_PLANNED,
        placement: { kind: "insert", index: 0 },
        expected: [READ_PLANNED, group(UNKNOWN, BACKLOG_PLANNED)],
      },
    ];

    for (const { name, sequence, id, placement, expected } of cases) {
      assert.deepEqual(placeInSequence(sequence, id, placement), expected, name);
    }
  });
});

const DROP_TARGET_RECT: DropRect = { left: 100, width: 30 };
const DRAGGED_WIDTH = 10;
const DRAGGED_CENTRE_BY_ZONE: Record<ChipDropZone, number> = { before: 104, join: 115, after: 126 };

const dropGeometry = (zone: ChipDropZone | undefined) =>
  zone === undefined
    ? { draggedRect: null, overRect: null }
    : {
        draggedRect: {
          left: DRAGGED_CENTRE_BY_ZONE[zone] - DRAGGED_WIDTH / 2,
          width: DRAGGED_WIDTH,
        },
        overRect: DROP_TARGET_RECT,
      };

describe("resolveSequenceDrop", () => {
  it("resolveSequenceDrop_EachDragAndTarget_ReturnsTheFullOrderToSendOrNoop", () => {
    const sequence = [BACKLOG_PLANNED, DOING_OLD, READ_PLANNED, BLOCKED_PLANNED];
    const grouped = [BACKLOG_PLANNED, group(DOING_OLD, READ_PLANNED), BLOCKED_PLANNED];
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
      readonly zone?: ChipDropZone;
      readonly from?: ReadonlyArray<string>;
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
        name: "doing card on the strip appends",
        activeId: card(DOING_NEW),
        overId: SEQUENCE_STRIP_DROP_ID,
        expected: send([...sequence, DOING_NEW]),
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
        name: "chip moved left takes the target slot",
        activeId: chip(BLOCKED_PLANNED),
        overId: chip(BACKLOG_PLANNED),
        expected: send([BLOCKED_PLANNED, BACKLOG_PLANNED, DOING_OLD, READ_PLANNED]),
      },
      {
        name: "chip in the left third of a later chip goes before it",
        activeId: chip(BACKLOG_PLANNED),
        overId: chip(BLOCKED_PLANNED),
        zone: "before",
        expected: send([DOING_OLD, READ_PLANNED, BACKLOG_PLANNED, BLOCKED_PLANNED]),
      },
      {
        name: "chip in the right third of a later chip goes after it",
        activeId: chip(BACKLOG_PLANNED),
        overId: chip(BLOCKED_PLANNED),
        zone: "after",
        expected: send([DOING_OLD, READ_PLANNED, BLOCKED_PLANNED, BACKLOG_PLANNED]),
      },
      {
        name: "chip in the middle third of another chip groups with it",
        activeId: chip(BLOCKED_PLANNED),
        overId: chip(DOING_OLD),
        zone: "join",
        expected: send([BACKLOG_PLANNED, group(DOING_OLD, BLOCKED_PLANNED), READ_PLANNED]),
      },
      {
        name: "chip in the middle third of a grouped chip joins that group",
        activeId: chip(BACKLOG_PLANNED),
        overId: chip(READ_PLANNED),
        zone: "join",
        from: grouped,
        expected: send([group(DOING_OLD, READ_PLANNED, BACKLOG_PLANNED), BLOCKED_PLANNED]),
      },
      {
        name: "grouped chip in the right third of a later chip ungroups after it",
        activeId: chip(DOING_OLD),
        overId: chip(BLOCKED_PLANNED),
        zone: "after",
        from: grouped,
        expected: send([BACKLOG_PLANNED, READ_PLANNED, BLOCKED_PLANNED, DOING_OLD]),
      },
      {
        name: "grouped chip beside its own group ungroups",
        activeId: chip(DOING_OLD),
        overId: chip(READ_PLANNED),
        zone: "before",
        from: grouped,
        expected: send([BACKLOG_PLANNED, DOING_OLD, READ_PLANNED, BLOCKED_PLANNED]),
      },
      {
        name: "grouped chip in the middle of its own group is a noop",
        activeId: chip(DOING_OLD),
        overId: chip(READ_PLANNED),
        zone: "join",
        from: grouped,
        expected: send(null),
      },
      {
        name: "grouped chip on the strip ungroups to the end",
        activeId: chip(READ_PLANNED),
        overId: SEQUENCE_STRIP_DROP_ID,
        from: grouped,
        expected: send([BACKLOG_PLANNED, DOING_OLD, BLOCKED_PLANNED, READ_PLANNED]),
      },
      {
        name: "new card in the middle third of a chip groups with it",
        activeId: card(READ_UNPLANNED),
        overId: chip(READ_PLANNED),
        zone: "join",
        expected: send([
          BACKLOG_PLANNED,
          DOING_OLD,
          group(READ_PLANNED, READ_UNPLANNED),
          BLOCKED_PLANNED,
        ]),
      },
      {
        name: "new card in the right third of a grouped chip goes after the group",
        activeId: card(READ_UNPLANNED),
        overId: chip(DOING_OLD),
        zone: "after",
        from: grouped,
        expected: send([
          BACKLOG_PLANNED,
          group(DOING_OLD, READ_PLANNED),
          READ_UNPLANNED,
          BLOCKED_PLANNED,
        ]),
      },
      {
        name: "closed card in the middle third of a chip is ignored",
        activeId: card(DONE),
        overId: chip(READ_PLANNED),
        zone: "join",
        expected: send(null),
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

    for (const { name, activeId, overId, zone, from, expected } of cases) {
      const outcome = resolveSequenceDrop({
        activeId,
        overId,
        sequence: from ?? sequence,
        issuesById: ISSUES_BY_ID,
        ...dropGeometry(zone),
      });
      assert.deepEqual(outcome, expected, name);
    }
  });

  it("removeFromSequence_PlannedOrAbsentId_ReturnsTheOrderWithoutIt", () => {
    const sequence = [BACKLOG_PLANNED, DOING_OLD, READ_PLANNED];

    assert.deepEqual(removeFromSequence(sequence, READ_PLANNED), [BACKLOG_PLANNED, DOING_OLD]);
    assert.deepEqual(removeFromSequence(sequence, UNKNOWN), sequence);
    assert.deepEqual(
      removeFromSequence(
        [group(BACKLOG_PLANNED, DOING_OLD, READ_PLANNED), group(BLOCKED_PLANNED, UNKNOWN)],
        DOING_OLD,
      ),
      [group(BACKLOG_PLANNED, READ_PLANNED), group(BLOCKED_PLANNED, UNKNOWN)],
    );
    assert.deepEqual(
      removeFromSequence([group(BACKLOG_PLANNED, READ_PLANNED), DOING_OLD], READ_PLANNED),
      [BACKLOG_PLANNED, DOING_OLD],
    );
  });
});

describe("pending sequence writes", () => {
  const settled = (writes: ReadonlyArray<PendingSequenceWrite>, token: number, ids: string[]) =>
    settlePendingWrite(writes, token, ids);

  it("pendingWrites_TwoQuickDropsAndAnEarlierFailure_NeverShowAStaleOrder", () => {
    const base = [BACKLOG_PLANNED];
    const first = [READ_PLANNED, BACKLOG_PLANNED];
    const second = [BLOCKED_PLANNED, READ_PLANNED, BACKLOG_PLANNED];
    let writes: ReadonlyArray<PendingSequenceWrite> = [];

    writes = startPendingWrite(writes, { token: 1, ids: first, base });
    writes = startPendingWrite(writes, { token: 2, ids: second, base });
    assert.strictEqual(displayedSequence(base, writes), second);

    writes = settled(writes, 1, [...first]);
    const afterFirstSnapshot = [...first];
    writes = reconcilePendingWrites(writes, afterFirstSnapshot);
    assert.strictEqual(displayedSequence(afterFirstSnapshot, writes), second);

    writes = settled(writes, 2, [...second]);
    writes = reconcilePendingWrites(writes, afterFirstSnapshot);
    assert.deepEqual(displayedSequence(afterFirstSnapshot, writes), second);

    const finalSnapshot = [...second];
    writes = reconcilePendingWrites(writes, finalSnapshot);
    assert.deepEqual(writes, []);
    assert.strictEqual(displayedSequence(finalSnapshot, writes), finalSnapshot);

    let failing: ReadonlyArray<PendingSequenceWrite> = [];
    failing = startPendingWrite(failing, { token: 1, ids: first, base });
    failing = startPendingWrite(failing, { token: 2, ids: second, base });
    failing = failPendingWrite(failing, 1);
    assert.strictEqual(displayedSequence(base, failing), second);
    failing = failPendingWrite(failing, 2);
    assert.strictEqual(displayedSequence(base, failing), base);
  });

  it("pendingWrites_ResultEqualsTheCurrentSnapshot_DoesNotStick", () => {
    const snapshot = [BACKLOG_PLANNED, READ_PLANNED];
    let writes = startPendingWrite([], {
      token: 1,
      ids: [READ_PLANNED, BACKLOG_PLANNED],
      base: snapshot,
    });

    writes = settled(writes, 1, [...snapshot]);
    writes = reconcilePendingWrites(writes, snapshot);

    assert.deepEqual(writes, []);
    assert.strictEqual(displayedSequence(snapshot, writes), snapshot);
  });

  it("pendingWrites_SettledWrite_ShowsTheServerResultUntilADifferentSnapshotArrives", () => {
    const base = [BACKLOG_PLANNED, READ_PLANNED];
    const requested = [READ_PLANNED, DONE, BACKLOG_PLANNED];
    const result = [READ_PLANNED, BACKLOG_PLANNED];
    let writes = startPendingWrite([], { token: 1, ids: requested, base });

    writes = settled(writes, 1, result);
    writes = reconcilePendingWrites(writes, base);
    assert.strictEqual(displayedSequence(base, writes), result);

    const external = [BLOCKED_PLANNED];
    writes = reconcilePendingWrites(writes, external);
    assert.deepEqual(writes, []);
    assert.strictEqual(displayedSequence(external, writes), external);
  });

  it("pendingWrites_UnrelatedSnapshotWhileInFlight_StillShowsTheResultAfterTheWriteSettles", () => {
    const base = [BACKLOG_PLANNED];
    const requested = [READ_PLANNED, BACKLOG_PLANNED];
    let writes = startPendingWrite([], { token: 1, ids: requested, base });

    const unrelated = [...base];
    writes = reconcilePendingWrites(writes, unrelated);
    writes = settled(writes, 1, [...requested]);
    writes = reconcilePendingWrites(writes, unrelated);

    assert.deepEqual(displayedSequence(unrelated, writes), requested);
  });

  it("pendingWrites_LaterDropRevertsToTheSnapshotOrder_KeepsTheEarlierWriteInFlight", () => {
    const base = [BACKLOG_PLANNED, READ_PLANNED];
    const swapped = [READ_PLANNED, BACKLOG_PLANNED];
    let writes = startPendingWrite([], { token: 1, ids: swapped, base });
    writes = startPendingWrite(writes, { token: 2, ids: [...base], base });

    writes = reconcilePendingWrites(writes, base);

    assert.strictEqual(writes.length, 2);
    writes = settled(writes, 1, [...swapped]);
    writes = settled(writes, 2, [...base]);
    writes = reconcilePendingWrites(writes, swapped);
    assert.deepEqual(displayedSequence(swapped, writes), base);
    writes = reconcilePendingWrites(writes, [...base]);
    assert.deepEqual(writes, []);
  });

  it("pendingWrites_InFlightWriteAndUnrelatedSnapshot_KeepsTheInFlightOrder", () => {
    const base = [BACKLOG_PLANNED];
    const requested = [READ_PLANNED, BACKLOG_PLANNED];
    const writes = startPendingWrite([], { token: 1, ids: requested, base });

    const reconciled = reconcilePendingWrites(writes, [BLOCKED_PLANNED]);

    assert.strictEqual(displayedSequence([BLOCKED_PLANNED], reconciled), requested);
  });
});

describe("pending writes by epic", () => {
  it("pendingWritesByEpic_WritesInDifferentEpics_StayInTheirOwnSequence", () => {
    const epic = "Foundation";
    const noEpicBase = [BACKLOG_PLANNED];
    const epicBase = [READ_PLANNED];
    let byEpic: PendingWritesByEpic = {};
    byEpic = withPendingWrites(
      byEpic,
      null,
      startPendingWrite(pendingWritesFor(byEpic, null), {
        token: 1,
        ids: [BLOCKED_PLANNED, BACKLOG_PLANNED],
        base: noEpicBase,
      }),
    );
    byEpic = withPendingWrites(
      byEpic,
      epic,
      startPendingWrite(pendingWritesFor(byEpic, epic), {
        token: 2,
        ids: [BACKLOG_PLANNED, READ_PLANNED],
        base: epicBase,
      }),
    );

    assert.deepEqual(displayedSequence(noEpicBase, pendingWritesFor(byEpic, null)), [
      BLOCKED_PLANNED,
      BACKLOG_PLANNED,
    ]);
    assert.deepEqual(displayedSequence(epicBase, pendingWritesFor(byEpic, epic)), [
      BACKLOG_PLANNED,
      READ_PLANNED,
    ]);
    assert.deepEqual(pendingWritesFor(byEpic, "Other"), []);

    const settled = settlePendingWrite(pendingWritesFor(byEpic, epic), 2, [
      BACKLOG_PLANNED,
      READ_PLANNED,
    ]);
    const caughtUp = reconcilePendingWrites(settled, [BACKLOG_PLANNED, READ_PLANNED]);
    byEpic = withPendingWrites(byEpic, epic, caughtUp);

    assert.deepEqual(pendingWritesFor(byEpic, epic), []);
    assert.strictEqual(pendingWritesFor(byEpic, null).length, 1);
  });
});

describe("activeSequence", () => {
  const FOUNDATION = "Foundation";
  const snapshot = {
    sequence: [BACKLOG_PLANNED],
    epicSequences: { [FOUNDATION]: [READ_PLANNED], Other: [] },
  };

  it("activeSequence_EpicFilterAndServerSupport_PicksTheMatchingSequenceAndWritability", () => {
    assert.deepEqual(activeSequence(snapshot, ""), {
      epic: null,
      ids: [BACKLOG_PLANNED],
      writable: true,
    });
    assert.deepEqual(activeSequence(snapshot, FOUNDATION), {
      epic: FOUNDATION,
      ids: [READ_PLANNED],
      writable: true,
    });
    assert.deepEqual(activeSequence(snapshot, "foundation"), {
      epic: FOUNDATION,
      ids: [READ_PLANNED],
      writable: true,
    });
    assert.deepEqual(activeSequence(snapshot, "Other"), {
      epic: "Other",
      ids: [],
      writable: true,
    });
    assert.deepEqual(activeSequence(snapshot, "Archived"), {
      epic: null,
      ids: [],
      writable: false,
    });
    const olderServer = { sequence: [BACKLOG_PLANNED] };
    assert.deepEqual(activeSequence(olderServer, ""), {
      epic: null,
      ids: [BACKLOG_PLANNED],
      writable: true,
    });
    assert.deepEqual(activeSequence(olderServer, FOUNDATION), {
      epic: null,
      ids: [BACKLOG_PLANNED],
      writable: false,
    });
  });
});

describe("resolveBoardDragEnd", () => {
  it("resolveBoardDragEnd_EachDragAndTarget_RoutesToTheSequenceOrTheStatusColumnsNeverBoth", () => {
    const sequence = [BACKLOG_PLANNED, READ_PLANNED];
    const card = boardCardDragId;
    const column = (id: string, target: string, speed: "confirm" | "now" | "force") =>
      ({ kind: "column", issue: ISSUES_BY_ID.get(id), target, speed }) as BoardDragOutcome;
    const ignore: BoardDragOutcome = { kind: "ignore" };
    const cases: ReadonlyArray<{
      readonly name: string;
      readonly activeId: string;
      readonly overId: string;
      readonly expected: BoardDragOutcome;
    }> = [
      {
        name: "card on the strip writes the order and changes no status",
        activeId: card(READ_UNPLANNED),
        overId: SEQUENCE_STRIP_DROP_ID,
        expected: { kind: "sequence", ids: [...sequence, READ_UNPLANNED] },
      },
      {
        name: "card on a chip writes the order and changes no status",
        activeId: card(BACKLOG_UNPLANNED),
        overId: sequenceChipDragId(READ_PLANNED),
        expected: {
          kind: "sequence",
          ids: [BACKLOG_PLANNED, BACKLOG_UNPLANNED, READ_PLANNED],
        },
      },
      {
        name: "ineligible card on the strip does nothing",
        activeId: card(DONE),
        overId: SEQUENCE_STRIP_DROP_ID,
        expected: ignore,
      },
      {
        name: "chip on a column does nothing",
        activeId: sequenceChipDragId(READ_PLANNED),
        overId: "column:doing",
        expected: ignore,
      },
      {
        name: "card on a column confirms",
        activeId: card(READ_UNPLANNED),
        overId: "column:doing",
        expected: column(READ_UNPLANNED, "doing", "confirm"),
      },
      {
        name: "card on an action-now target dispatches now",
        activeId: card(READ_UNPLANNED),
        overId: "dispatch:read",
        expected: column(READ_UNPLANNED, "read", "now"),
      },
      {
        name: "card on a force target forces",
        activeId: card(READ_UNPLANNED),
        overId: "force:done",
        expected: column(READ_UNPLANNED, "done", "force"),
      },
      {
        name: "card on an unknown target does nothing",
        activeId: card(READ_UNPLANNED),
        overId: "elsewhere",
        expected: ignore,
      },
      {
        name: "unknown card on a column does nothing",
        activeId: card("zzzzz-missing"),
        overId: "column:doing",
        expected: ignore,
      },
    ];

    for (const { name, activeId, overId, expected } of cases) {
      const outcome = resolveBoardDragEnd({
        activeId,
        overId,
        sequence,
        issuesById: ISSUES_BY_ID,
        ...dropGeometry(undefined),
      });
      assert.deepEqual(outcome, expected, name);
    }
  });

  it("boardCardIssueId_CardOrOtherDragId_ReturnsTheIssueIdOnlyForACard", () => {
    assert.strictEqual(boardCardIssueId(boardCardDragId(READ_PLANNED)), READ_PLANNED);
    assert.strictEqual(boardCardIssueId(sequenceChipDragId(READ_PLANNED)), null);
    assert.strictEqual(boardCardIssueId(READ_PLANNED), null);
  });
});
