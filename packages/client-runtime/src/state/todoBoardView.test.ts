import type { TodoBoardSnapshot, TodoIssue } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import {
  BOARD_SORT_OPTIONS,
  BOARD_STATUS_GLYPHS,
  boardArchiveEligibleSubtrees,
  boardCommonTagQuickFilters,
  boardEpicQuickFilters,
  boardSectionBadges,
  boardArchiveSweepCandidates,
  boardQuestionBadge,
  boardStatusColourClass,
  boardStatusGlyph,
  boardStatusLabel,
  boardTags,
  buildBlockedByIndex,
  buildBoardViewModel,
  cardHueStyle,
  filterIssuesByTag,
  isQuickFilterActive,
  matchesIssueFreeText,
  matchesTagSpec,
  parseTagSpec,
  sortBoardIssues,
} from "./todoBoardView.ts";

const DEFAULT_BOARD_UI_STATE = { tag: null, sort: "updated-desc" } as const;

function issue(overrides: Partial<TodoIssue> & Pick<TodoIssue, "id" | "title">): TodoIssue {
  return {
    status: "backlog",
    created: "2026-09-01T00:00:00.000Z",
    updated: "2026-09-01T00:00:00.000Z",
    tags: [],
    epic: null,
    parentId: null,
    depth: 0,
    rootHue: null,
    markerPath: `.todo/issues/${overrides.id}.md`,
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

function sections(overrides: Partial<TodoIssue["sections"]> = {}): TodoIssue["sections"] {
  return {
    brief: { content: false, text: "" },
    reading: { content: false, marker: false },
    doing: { content: false, marker: false },
    log: { content: false },
    openQuestions: { content: false, hasOpen: false, hasHumanOpen: false },
    ...overrides,
  };
}

function snapshot(issues: TodoIssue[]): TodoBoardSnapshot {
  return { root: "C:/repo/.todo", repoName: "repo", issues };
}

function columnOf(model: ReturnType<typeof buildBoardViewModel>, id: string): string {
  return model.columns.find((column) => column.cards.some((card) => card.issue.id === id))!.status;
}

function visibleIds(model: ReturnType<typeof buildBoardViewModel>): Array<string> {
  return model.columns.flatMap((column) => column.cards.map((card) => card.issue.id));
}

describe("epic quick-filter derivation", () => {
  it("derives one button per epic id, deduped, with the first root's hue", () => {
    const first = issue({ id: "roota", title: "a", tags: ["Epic"], epic: "found", rootHue: 210 });
    const duplicate = issue({
      id: "rootb",
      title: "b",
      tags: ["Epic"],
      epic: "found",
      rootHue: 300,
    });
    const second = issue({ id: "rootc", title: "c", tags: ["Epic"], epic: "other", rootHue: 42 });
    assert.deepEqual(boardEpicQuickFilters([first, duplicate, second]), [
      { epic: "found", hue: 210 },
      { epic: "other", hue: 42 },
    ]);
  });

  it("skips issues without the Epic tag and Epic-tagged issues with an empty epic id", () => {
    const untagged = issue({ id: "plain", title: "p", epic: "found" });
    const emptyEpic = issue({ id: "roote", title: "e", tags: ["Epic"], epic: null });
    assert.deepEqual(boardEpicQuickFilters([untagged, emptyEpic]), []);
  });

  it("recognises the Epic marker tag case-insensitively", () => {
    const marker = issue({ id: "root", title: "r", tags: ["epic"], epic: "found", rootHue: 210 });
    assert.deepEqual(boardEpicQuickFilters([marker]), [{ epic: "found", hue: 210 }]);
  });
});

describe("common-tag recency ranking", () => {
  const DAY = 86_400_000;
  const REFERENCE = "2026-09-20T00:00:00.000Z";
  const updatedDaysAgo = (days: number) =>
    new Date(Date.parse(REFERENCE) - days * DAY).toISOString();

  it("ranks tags by recency-weighted occurrences measured from the newest issue", () => {
    const issues = [
      issue({ id: "a", title: "a", tags: ["hot"], updated: REFERENCE }),
      issue({ id: "b", title: "b", tags: ["hot"], updated: REFERENCE }),
      issue({ id: "c", title: "c", tags: ["rare"], updated: REFERENCE }),
      issue({ id: "d", title: "d", tags: ["rare"], updated: updatedDaysAgo(28) }),
      issue({ id: "e", title: "e", tags: ["mid"], updated: REFERENCE }),
      issue({ id: "f", title: "f", tags: ["stale"], updated: updatedDaysAgo(14) }),
      issue({ id: "g", title: "g", tags: ["ancient"], updated: updatedDaysAgo(28) }),
    ];
    assert.deepEqual(boardCommonTagQuickFilters(issues), [
      "hot",
      "rare",
      "mid",
      "stale",
      "ancient",
    ]);
  });

  it("caps the ranked list at eight tags", () => {
    const issues = Array.from({ length: 9 }, (_, index) =>
      issue({
        id: `carrier-${index}`,
        title: `carrier ${index}`,
        tags: [`t${String(index + 1).padStart(2, "0")}`],
        updated: updatedDaysAgo(index),
      }),
    );
    assert.deepEqual(boardCommonTagQuickFilters(issues), [
      "t01",
      "t02",
      "t03",
      "t04",
      "t05",
      "t06",
      "t07",
      "t08",
    ]);
  });

  it("breaks score ties tag-ascending", () => {
    const issues = [
      issue({ id: "a", title: "a", tags: ["zeta"], updated: REFERENCE }),
      issue({ id: "b", title: "b", tags: ["alpha"], updated: REFERENCE }),
    ];
    assert.deepEqual(boardCommonTagQuickFilters(issues), ["alpha", "zeta"]);
  });

  it("returns an empty list for a board without tags", () => {
    assert.deepEqual(boardCommonTagQuickFilters([issue({ id: "a", title: "a" })]), []);
    assert.deepEqual(boardCommonTagQuickFilters([]), []);
  });

  it("never ranks the Epic marker tag or an epic id among the common tags", () => {
    const epicRoot = issue({
      id: "root",
      title: "root",
      tags: ["Epic", "found", "ui"],
      epic: "found",
      updated: "2026-09-20T00:00:00.000Z",
    });
    assert.deepEqual(boardCommonTagQuickFilters([epicRoot]), ["ui"]);
  });
});

describe("tag-spec comma-OR matching", () => {
  const tagged = [
    issue({ id: "a", title: "a", tags: ["board"] }),
    issue({ id: "b", title: "b", tags: ["todo-skill"] }),
    issue({ id: "c", title: "c", tags: ["unrelated"] }),
  ];

  it("splits on commas and drops blank terms", () => {
    assert.deepEqual(parseTagSpec("board, todo-skill,, "), ["board", "todo-skill"]);
    assert.deepEqual(parseTagSpec(""), []);
    assert.deepEqual(parseTagSpec("   "), []);
  });

  it("passes every issue through when the spec holds no terms", () => {
    assert.deepEqual(
      matchesTagSpec(
        tagged.map((entry) => entry.tags),
        parseTagSpec(""),
      ),
      true,
    );
    assert.equal(matchesTagSpec([], []), true);
  });

  it("matches a single term and OR-semantics across terms", () => {
    assert.equal(matchesTagSpec(["board"], ["board"]), true);
    assert.equal(matchesTagSpec(["board"], ["todo-skill"]), false);
    assert.equal(matchesTagSpec(["todo-skill"], ["board", "todo-skill"]), true);
    assert.equal(matchesTagSpec(["unrelated"], ["board", "todo-skill"]), false);
  });

  it("matches case-insensitively, matching the PowerShell -contains parity", () => {
    assert.equal(matchesTagSpec(["Board"], ["board"]), true);
    assert.equal(matchesTagSpec(["board"], ["BOARD"]), true);
    assert.equal(matchesTagSpec(["unrelated"], ["Board"]), false);
  });
});

describe("free-text issue matching", () => {
  it("matches a tag substring case-insensitively", () => {
    assert.equal(
      matchesIssueFreeText(issue({ id: "a", title: "a", tags: ["todo-skill"] }), "SKILL"),
      true,
    );
    assert.equal(
      matchesIssueFreeText(issue({ id: "a", title: "a", tags: ["todo-skill"] }), "skill"),
      true,
    );
    assert.equal(
      matchesIssueFreeText(issue({ id: "a", title: "a", tags: ["todo-skill"] }), "nope"),
      false,
    );
  });

  it("matches the five-character short id case-insensitively", () => {
    assert.equal(matchesIssueFreeText(issue({ id: "10eb1-tag", title: "t" }), "10eb"), true);
    assert.equal(matchesIssueFreeText(issue({ id: "10eb1-tag", title: "t" }), "0EB1"), true);
    assert.equal(matchesIssueFreeText(issue({ id: "10eb1-tag", title: "t" }), "10eb1-tag"), false);
  });

  it("ignores titles and bodies, matching tags and short ids only", () => {
    assert.equal(
      matchesIssueFreeText(issue({ id: "a", title: "restore filters" }), "restore"),
      false,
    );
  });

  it("treats a blank query as no filter", () => {
    assert.equal(matchesIssueFreeText(issue({ id: "a", title: "a" }), ""), true);
    assert.equal(matchesIssueFreeText(issue({ id: "a", title: "a" }), "   "), true);
  });
});

describe("quick-filter active state", () => {
  it("is active when the label is one of the comma-OR terms, case-insensitively", () => {
    assert.equal(isQuickFilterActive("ui", { tagSpec: "ui,board" }), true);
    assert.equal(isQuickFilterActive("UI", { tagSpec: "ui,board" }), true);
    assert.equal(isQuickFilterActive("ui", { tagSpec: "board" }), false);
    assert.equal(isQuickFilterActive("ui", { tagSpec: null }), false);
  });

  it("is active when the free-text query matches the label", () => {
    assert.equal(isQuickFilterActive("todo-skill", { query: "skill" }), true);
    assert.equal(isQuickFilterActive("todo-skill", { query: "  skill  " }), true);
    assert.equal(isQuickFilterActive("ui", { query: "ux" }), false);
  });

  it("is inactive without any spec term or query match", () => {
    assert.equal(isQuickFilterActive("ui", {}), false);
    assert.equal(isQuickFilterActive("ui", { tagSpec: "", query: "" }), false);
  });
});

describe("board status furniture", () => {
  it("labels every canonical status and falls back to the raw status", () => {
    assert.equal(boardStatusLabel("doing"), "Doing");
    assert.equal(boardStatusLabel("cancelled"), "Cancelled");
    assert.equal(boardStatusLabel("weird"), "weird");
  });

  it("gives every canonical status a glyph and unknown statuses the neutral one", () => {
    assert.equal(boardStatusGlyph("backlog"), "○");
    assert.equal(boardStatusGlyph("read"), "◐");
    assert.equal(boardStatusGlyph("doing"), "▶");
    assert.equal(boardStatusGlyph("blocked"), "⛔");
    assert.equal(boardStatusGlyph("done"), "✓");
    assert.equal(boardStatusGlyph("cancelled"), "✕");
    assert.equal(boardStatusGlyph("weird"), "○");
  });

  it("maps glyph and colour lookups consistently with the furniture tables", () => {
    for (const status of Object.keys(BOARD_STATUS_GLYPHS)) {
      assert.equal(boardStatusGlyph(status), BOARD_STATUS_GLYPHS[status as never]);
      assert.match(boardStatusColourClass(status), /^text-/);
    }
  });

  it("flags [human]-marked open questions red and ordinary ones amber", () => {
    assert.equal(
      boardQuestionBadge(
        issue({
          id: "a",
          title: "a",
          sections: {
            brief: { content: false, text: "" },
            reading: { content: false, marker: false },
            doing: { content: false, marker: false },
            log: { content: false },
            openQuestions: { content: true, hasOpen: true, hasHumanOpen: true },
          },
        }),
      ),
      "human",
    );
    assert.equal(
      boardQuestionBadge(
        issue({
          id: "b",
          title: "b",
          sections: {
            brief: { content: false, text: "" },
            reading: { content: false, marker: false },
            doing: { content: false, marker: false },
            log: { content: false },
            openQuestions: { content: true, hasOpen: true, hasHumanOpen: false },
          },
        }),
      ),
      "open",
    );
    assert.equal(boardQuestionBadge(issue({ id: "c", title: "c" })), null);
  });
});

describe("card section badges", () => {
  it("emits B, R, D, Log in order as ghosts when nothing is written", () => {
    const badges = boardSectionBadges(issue({ id: "a", title: "a" }));
    assert.deepEqual(
      badges.map((badge) => [badge.label, badge.state, badge.title]),
      [
        ["B", "ghost", "B: not started"],
        ["R", "ghost", "R: not started"],
        ["D", "ghost", "D: not started"],
        ["Log", "ghost", "Log: not started"],
      ],
    );
  });

  it("fills B and Log from content alone and never marks them hollow", () => {
    const badges = boardSectionBadges(
      issue({
        id: "b",
        title: "b",
        sections: sections({
          brief: { content: true, text: "brief" },
          log: { content: true },
        }),
      }),
    );
    assert.deepEqual(
      badges.map((badge) => [badge.label, badge.state, badge.title]),
      [
        ["B", "filled", "B: written"],
        ["R", "ghost", "R: not started"],
        ["D", "ghost", "D: not started"],
        ["Log", "filled", "Log: written"],
      ],
    );
  });

  it("fills R and D on content, naming the done-and-recorded marker state", () => {
    const badges = boardSectionBadges(
      issue({
        id: "c",
        title: "c",
        sections: sections({
          reading: { content: true, marker: true },
          doing: { content: true, marker: false },
        }),
      }),
    );
    assert.deepEqual(
      badges.map((badge) => [badge.label, badge.state, badge.title]),
      [
        ["B", "ghost", "B: not started"],
        ["R", "filled", "R: done and recorded"],
        ["D", "filled", "D: written"],
        ["Log", "ghost", "Log: not started"],
      ],
    );
  });

  it("marks marker-without-content R and D hollow as the hollow-claim edge", () => {
    const badges = boardSectionBadges(
      issue({
        id: "d",
        title: "d",
        sections: sections({
          reading: { content: false, marker: true },
          doing: { content: false, marker: true },
        }),
      }),
    );
    assert.deepEqual(
      badges.map((badge) => [badge.label, badge.state, badge.title]),
      [
        ["B", "ghost", "B: not started"],
        ["R", "hollow", "R: marked complete, no content"],
        ["D", "hollow", "D: marked complete, no content"],
        ["Log", "ghost", "Log: not started"],
      ],
    );
  });

  it("carries the badge row on every board card", () => {
    const written = issue({
      id: "written",
      title: "written",
      status: "doing",
      sections: sections({
        brief: { content: true, text: "brief" },
        doing: { content: false, marker: true },
      }),
    });
    const model = buildBoardViewModel(snapshot([written]), DEFAULT_BOARD_UI_STATE);
    const card = model.columns
      .find((column) => column.status === "doing")!
      .cards.find((entry) => entry.issue.id === "written")!;
    assert.deepEqual(
      card.badges.map((badge) => [badge.label, badge.state]),
      [
        ["B", "filled"],
        ["R", "ghost"],
        ["D", "hollow"],
        ["Log", "ghost"],
      ],
    );
  });
});

describe("board grouping and filtering", () => {
  it("always renders every canonical column in order, empty ones included", () => {
    const issues = [
      issue({ id: "d", title: "done one", status: "done" }),
      issue({ id: "b", title: "backlog one", status: "backlog" }),
      issue({ id: "g", title: "going", status: "doing" }),
    ];
    const model = buildBoardViewModel(snapshot(issues), DEFAULT_BOARD_UI_STATE);
    assert.deepEqual(
      model.columns.map((column) => [column.status, column.cards.map((card) => card.issue.id)]),
      [
        ["backlog", ["b"]],
        ["read", []],
        ["doing", ["g"]],
        ["delegated", []],
        ["blocked", []],
        ["done", ["d"]],
        ["cancelled", []],
      ],
    );
  });

  it("labels the delegated column independently of the status furniture", () => {
    const issues = [issue({ id: "g", title: "going", status: "doing" })];
    const model = buildBoardViewModel(snapshot(issues), DEFAULT_BOARD_UI_STATE);
    const delegated = model.columns.find((column) => column.status === "delegated")!;
    assert.equal(delegated.label, "Delegated");
    assert.equal(boardStatusLabel("delegated"), "delegated");
    assert.equal(boardStatusGlyph("delegated"), boardStatusGlyph("backlog"));
  });

  it("appends unknown statuses after the canonical ones, sorted", () => {
    const issues = [
      issue({ id: "z", title: "zebra", status: "zebra" }),
      issue({ id: "a", title: "alpha", status: "backlog" }),
      issue({ id: "y", title: "yak", status: "archived" }),
    ];
    const model = buildBoardViewModel(snapshot(issues), DEFAULT_BOARD_UI_STATE);
    assert.deepEqual(
      model.columns.map((column) => column.status),
      [
        "backlog",
        "read",
        "doing",
        "delegated",
        "blocked",
        "done",
        "cancelled",
        "archived",
        "zebra",
      ],
    );
    assert.equal(model.columns[7]!.label, "archived");
  });

  it("filters by tag and collects the board's tag vocabulary", () => {
    const issues = [
      issue({ id: "a", title: "tagged", tags: ["ui", "board"] }),
      issue({ id: "b", title: "other", tags: ["ui"] }),
      issue({ id: "c", title: "plain" }),
    ];
    assert.deepEqual(boardTags(issues), ["board", "ui"]);
    assert.deepEqual(
      filterIssuesByTag(issues, "ui").map((issue) => issue.id),
      ["a", "b"],
    );
    assert.deepEqual(
      filterIssuesByTag(issues, "board").map((issue) => issue.id),
      ["a"],
    );
    assert.equal(filterIssuesByTag(issues, null).length, 3);
  });

  it("sorts by updated desc, created asc, and ticket id per the declared options", () => {
    const issues = [
      issue({
        id: "c44aa",
        title: "late",
        created: "2026-09-02T00:00:00.000Z",
        updated: "2026-09-10T00:00:00.000Z",
      }),
      issue({
        id: "5d03e",
        title: "early",
        created: "2026-09-01T00:00:00.000Z",
        updated: "2026-09-11T00:00:00.000Z",
      }),
      issue({
        id: "1bfa3",
        title: "mid",
        created: "2026-09-02T00:00:00.000Z",
        updated: "2026-09-09T00:00:00.000Z",
      }),
    ];
    assert.deepEqual(
      sortBoardIssues(issues, "updated-desc").map((issue) => issue.id),
      ["5d03e", "c44aa", "1bfa3"],
    );
    assert.deepEqual(
      sortBoardIssues(issues, "created-asc").map((issue) => issue.id),
      ["5d03e", "1bfa3", "c44aa"],
    );
    assert.deepEqual(
      sortBoardIssues(issues, "id-asc").map((issue) => issue.id),
      ["1bfa3", "5d03e", "c44aa"],
    );
    assert.ok(BOARD_SORT_OPTIONS.some((option) => option.value === "updated-desc"));
  });
});

describe("delegated fold", () => {
  it("moves a done issue with an open child out of Done into Delegated", () => {
    const parent = issue({ id: "parent", title: "parent", status: "done" });
    const child = issue({ id: "kid", title: "kid", parentId: "parent", depth: 1, status: "read" });
    const model = buildBoardViewModel(snapshot([parent, child]), DEFAULT_BOARD_UI_STATE);
    const columnOf = (id: string) =>
      model.columns.find((column) => column.cards.some((card) => card.issue.id === id))!.status;
    assert.equal(columnOf("parent"), "delegated");
    assert.equal(columnOf("kid"), "read");
  });

  it("keeps the done presentation on a folded card", () => {
    const parent = issue({ id: "parent", title: "parent", status: "done" });
    const child = issue({ id: "kid", title: "kid", parentId: "parent", depth: 1, status: "doing" });
    const model = buildBoardViewModel(snapshot([parent, child]), DEFAULT_BOARD_UI_STATE);
    const card = model.columns
      .find((column) => column.status === "delegated")!
      .cards.find((entry) => entry.issue.id === "parent")!;
    assert.equal(card.glyph, boardStatusGlyph("done"));
    assert.equal(card.colourClass, boardStatusColourClass("done"));
  });

  it("folds on an unknown child status, which counts as open", () => {
    const parent = issue({ id: "parent", title: "parent", status: "done" });
    const child = issue({ id: "kid", title: "kid", parentId: "parent", depth: 1, status: "zebra" });
    const model = buildBoardViewModel(snapshot([parent, child]), DEFAULT_BOARD_UI_STATE);
    const delegated = model.columns.find((column) => column.status === "delegated")!;
    assert.deepEqual(
      delegated.cards.map((card) => card.issue.id),
      ["parent"],
    );
  });

  it("keeps a done issue in Done when every child is done or cancelled", () => {
    const parent = issue({ id: "parent", title: "parent", status: "done" });
    const doneChild = issue({
      id: "donekid",
      title: "done kid",
      parentId: "parent",
      depth: 1,
      status: "done",
    });
    const cancelledChild = issue({
      id: "cankid",
      title: "cancelled kid",
      parentId: "parent",
      depth: 1,
      status: "cancelled",
    });
    const model = buildBoardViewModel(
      snapshot([parent, doneChild, cancelledChild]),
      DEFAULT_BOARD_UI_STATE,
    );
    const done = model.columns.find((column) => column.status === "done")!;
    assert.deepEqual(
      done.cards.map((card) => card.issue.id),
      ["donekid", "parent"],
    );
    assert.equal(model.columns.find((column) => column.status === "delegated")!.cards.length, 0);
  });

  it("keeps a done issue without children in Done", () => {
    const solo = issue({ id: "solo", title: "solo", status: "done" });
    const model = buildBoardViewModel(snapshot([solo]), DEFAULT_BOARD_UI_STATE);
    const done = model.columns.find((column) => column.status === "done")!;
    assert.deepEqual(
      done.cards.map((card) => card.issue.id),
      ["solo"],
    );
  });

  it("keeps a doing issue with an open child in Doing", () => {
    const parent = issue({ id: "parent", title: "parent", status: "doing" });
    const child = issue({ id: "kid", title: "kid", parentId: "parent", depth: 1, status: "read" });
    const model = buildBoardViewModel(snapshot([parent, child]), DEFAULT_BOARD_UI_STATE);
    const doing = model.columns.find((column) => column.status === "doing")!;
    assert.deepEqual(
      doing.cards.map((card) => card.issue.id),
      ["parent"],
    );
    assert.equal(model.columns.find((column) => column.status === "delegated")!.cards.length, 0);
  });

  it("never folds a cancelled issue with an open child", () => {
    const parent = issue({ id: "parent", title: "parent", status: "cancelled" });
    const child = issue({ id: "kid", title: "kid", parentId: "parent", depth: 1, status: "read" });
    const model = buildBoardViewModel(snapshot([parent, child]), DEFAULT_BOARD_UI_STATE);
    const cancelled = model.columns.find((column) => column.status === "cancelled")!;
    assert.deepEqual(
      cancelled.cards.map((card) => card.issue.id),
      ["parent"],
    );
    assert.equal(model.columns.find((column) => column.status === "delegated")!.cards.length, 0);
  });

  it("never folds a child whose parent id resolves to nothing", () => {
    const orphan = issue({ id: "orphan", title: "orphan", parentId: "ghost", status: "doing" });
    const model = buildBoardViewModel(snapshot([orphan]), DEFAULT_BOARD_UI_STATE);
    const doing = model.columns.find((column) => column.status === "doing")!;
    assert.deepEqual(
      doing.cards.map((card) => card.issue.id),
      ["orphan"],
    );
  });

  it("never folds a done child whose parent id resolves to nothing", () => {
    const orphan = issue({ id: "orphan", title: "orphan", parentId: "ghost", status: "done" });
    const model = buildBoardViewModel(snapshot([orphan]), DEFAULT_BOARD_UI_STATE);
    const done = model.columns.find((column) => column.status === "done")!;
    assert.deepEqual(
      done.cards.map((card) => card.issue.id),
      ["orphan"],
    );
  });

  it("folds on the full snapshot's child statuses, not the tag-filtered view", () => {
    const parent = issue({ id: "parent", title: "parent", status: "done", tags: ["ui"] });
    const child = issue({
      id: "kid",
      title: "kid",
      parentId: "parent",
      depth: 1,
      status: "read",
      tags: ["other"],
    });
    const model = buildBoardViewModel(snapshot([parent, child]), { tag: "ui", sort: "id-asc" });
    const delegated = model.columns.find((column) => column.status === "delegated")!;
    assert.deepEqual(
      delegated.cards.map((card) => card.issue.id),
      ["parent"],
    );
  });
});

describe("blocked-by reverse index", () => {
  it("inverts blocks edges onto the blocked issue and deduplicates", () => {
    const issues = [
      issue({ id: "a", title: "blocker", links: { blocks: ["b", "c"], relates: [] } }),
      issue({ id: "d", title: "second blocker", links: { blocks: ["b"], relates: [] } }),
      issue({ id: "b", title: "blocked" }),
      issue({ id: "c", title: "also blocked" }),
    ];
    const index = buildBlockedByIndex(issues);
    assert.deepEqual(index.get("b"), ["a", "d"]);
    assert.deepEqual(index.get("c"), ["a"]);
    assert.equal(index.has("a"), false);
    assert.equal(index.has("d"), false);
  });
});

describe("card lineage presentation", () => {
  it("marks roots and children, carrying the lineage hue", () => {
    const root = issue({ id: "root", title: "root", rootHue: 210 });
    const child = issue({ id: "child", title: "child", parentId: "root", depth: 1, rootHue: 210 });
    const model = buildBoardViewModel(snapshot([root, child]), DEFAULT_BOARD_UI_STATE);
    const cards = new Map(model.columns[0]!.cards.map((card) => [card.issue.id, card]));
    assert.equal(cards.get("root")!.isRoot, true);
    assert.equal(cards.get("root")!.hue, 210);
    assert.equal(cards.get("child")!.isRoot, false);
    assert.equal(cards.get("child")!.hue, 210);
  });

  it("tints hue-bearing cards but leaves blocked cards and hueless cards untinted", () => {
    const root = issue({ id: "root", title: "root", status: "doing", rootHue: 210 });
    const child = issue({ id: "child", title: "child", parentId: "root", depth: 1, rootHue: 210 });
    const blocked = issue({ id: "blocked", title: "stuck", status: "blocked", rootHue: 210 });
    const neutral = issue({ id: "neutral", title: "plain", status: "done" });
    const model = buildBoardViewModel(
      snapshot([root, child, blocked, neutral]),
      DEFAULT_BOARD_UI_STATE,
    );
    const cards = new Map(
      model.columns.flatMap((column) => column.cards).map((card) => [card.issue.id, card]),
    );
    assert.equal(cards.get("root")!.tinted, true);
    assert.equal(cards.get("child")!.tinted, true);
    assert.equal(cards.get("blocked")!.tinted, false);
    assert.equal(cards.get("neutral")!.tinted, false);
  });

  it("emits a per-card hue custom property only for hue-bearing cards", () => {
    assert.deepEqual(cardHueStyle(issue({ id: "a", title: "a", rootHue: 210 })), {
      "--card-hue": "210",
    });
    assert.deepEqual(cardHueStyle(issue({ id: "b", title: "b", rootHue: null })), {});
  });

  it("attaches the parent chip and resolved blocked-by rows to child cards", () => {
    const root = issue({ id: "root", title: "the root" });
    const blocker = issue({ id: "blocker", title: "first do this", status: "doing" });
    const child = issue({
      id: "child",
      title: "the child",
      parentId: "root",
      depth: 1,
      links: { blocks: [], relates: [] },
    });
    buildBlockedByIndex([child, blocker, root]);
    const model = buildBoardViewModel(snapshot([root, blocker, child]), DEFAULT_BOARD_UI_STATE);
    const cards = new Map(
      model.columns.flatMap((column) => column.cards).map((card) => [card.issue.id, card]),
    );
    assert.deepEqual(cards.get("child")!.parent, { id: "root", title: "the root" });
    assert.equal(cards.get("root")!.parent, null);
    assert.deepEqual(cards.get("root")!.blockedBy, []);
  });

  it("resolves blocked-by edges to ids and titles on the card", () => {
    const blocker = issue({
      id: "blocker",
      title: "first do this",
      status: "doing",
      links: { blocks: ["target"], relates: [] },
    });
    const target = issue({ id: "target", title: "the target", status: "backlog" });
    const model = buildBoardViewModel(snapshot([blocker, target]), DEFAULT_BOARD_UI_STATE);
    const cards = new Map(
      model.columns.flatMap((column) => column.cards).map((card) => [card.issue.id, card]),
    );
    assert.deepEqual(cards.get("target")!.blockedBy, [{ id: "blocker", title: "first do this" }]);
  });
});

describe("archive eligibility", () => {
  it("marks a closed root with closed children eligible and sweepable", () => {
    const root = issue({ id: "root", title: "root", status: "done" });
    const child = issue({
      id: "child",
      title: "child",
      parentId: "root",
      depth: 1,
      status: "cancelled",
    });
    const grandchild = issue({
      id: "grand",
      title: "grand",
      parentId: "child",
      depth: 2,
      status: "done",
    });
    assert.deepEqual(
      boardArchiveEligibleSubtrees([root, child, grandchild]).map((candidate) => candidate.id),
      ["root", "child", "grand"],
    );
    assert.deepEqual(
      boardArchiveSweepCandidates([root, child, grandchild]).map((candidate) => candidate.id),
      ["root"],
    );
  });

  it("marks a root with one open child ineligible and names the blocker", () => {
    const root = issue({ id: "root", title: "root", status: "done" });
    const openChild = issue({
      id: "kid",
      title: "kid",
      parentId: "root",
      depth: 1,
      status: "doing",
    });
    assert.deepEqual(boardArchiveEligibleSubtrees([root, openChild]), []);
    assert.deepEqual(boardArchiveSweepCandidates([root, openChild]), []);
  });

  it("counts unknown statuses as open in eligibility", () => {
    const root = issue({ id: "root", title: "root", status: "done" });
    const weird = issue({
      id: "weird",
      title: "weird",
      parentId: "root",
      depth: 1,
      status: "zebra",
    });
    assert.deepEqual(boardArchiveEligibleSubtrees([root, weird]), []);
  });

  it("makes a nested closed subtree eligible for the flyout but not the sweep", () => {
    const epic = issue({ id: "epic", title: "epic", status: "doing" });
    const mid = issue({ id: "mid", title: "mid", parentId: "epic", depth: 1, status: "doing" });
    const leaf = issue({
      id: "leaf",
      title: "leaf",
      parentId: "mid",
      depth: 2,
      status: "done",
    });
    assert.deepEqual(
      boardArchiveEligibleSubtrees([epic, mid, leaf]).map((candidate) => candidate.id),
      ["leaf"],
    );
    assert.deepEqual(boardArchiveSweepCandidates([epic, mid, leaf]), []);
  });

  it("counts an open subtree root as ineligible", () => {
    const open = issue({ id: "open", title: "open", status: "backlog" });
    assert.deepEqual(boardArchiveEligibleSubtrees([open]), []);
  });

  it("treats a missing parent as its own subtree", () => {
    const orphan = issue({ id: "orphan", title: "orphan", parentId: "ghost", depth: 3 });
    const closed = issue({ id: "shut", title: "shut", status: "cancelled" });
    assert.deepEqual(
      boardArchiveEligibleSubtrees([orphan, closed]).map((candidate) => candidate.id),
      ["shut"],
    );
  });
});

describe("tag-filter ancestor expansion", () => {
  it("pulls a tagged child's untagged parent into the filtered board", () => {
    const parent = issue({ id: "parent", title: "parent" });
    const child = issue({
      id: "child",
      title: "child",
      parentId: "parent",
      depth: 1,
      tags: ["ui"],
    });
    const model = buildBoardViewModel(snapshot([parent, child]), { tag: "ui", sort: "id-asc" });
    assert.deepEqual(visibleIds(model), ["child", "parent"]);
    assert.equal(columnOf(model, "parent"), "backlog");
    assert.equal(columnOf(model, "child"), "backlog");
  });

  it("walks a tagged leaf's ancestor chain transitively to the root", () => {
    const root = issue({ id: "root", title: "root" });
    const mid = issue({ id: "mid", title: "mid", parentId: "root", depth: 1 });
    const leaf = issue({ id: "leaf", title: "leaf", parentId: "mid", depth: 2, tags: ["ui"] });
    const model = buildBoardViewModel(snapshot([root, mid, leaf]), { tag: "ui", sort: "id-asc" });
    assert.deepEqual(visibleIds(model), ["leaf", "mid", "root"]);
  });

  it("terminates on a direct parent cycle and still shows both members", () => {
    const a = issue({ id: "a", title: "a", parentId: "b", tags: ["ui"] });
    const b = issue({ id: "b", title: "b", parentId: "a", depth: 1 });
    const model = buildBoardViewModel(snapshot([a, b]), { tag: "ui", sort: "id-asc" });
    assert.deepEqual(visibleIds(model), ["a", "b"]);
  });

  it("terminates when a matched issue's chain enters a cycle from outside", () => {
    const anchor = issue({
      id: "anchor",
      title: "anchor",
      parentId: "c1",
      depth: 1,
      tags: ["ui"],
    });
    const c1 = issue({ id: "c1", title: "c1", parentId: "c2", depth: 2 });
    const c2 = issue({ id: "c2", title: "c2", parentId: "c1", depth: 3 });
    const model = buildBoardViewModel(snapshot([anchor, c1, c2]), { tag: "ui", sort: "id-asc" });
    assert.deepEqual(visibleIds(model), ["anchor", "c1", "c2"]);
  });

  it("terminates on a self-parent and shows the issue exactly once", () => {
    const loopy = issue({ id: "loopy", title: "loopy", parentId: "loopy", tags: ["ui"] });
    const model = buildBoardViewModel(snapshot([loopy]), { tag: "ui", sort: "id-asc" });
    assert.deepEqual(visibleIds(model), ["loopy"]);
  });

  it("keeps a tagged child whose parent id resolves to nothing, without throwing", () => {
    const child = issue({ id: "child", title: "child", parentId: "ghost", tags: ["ui"] });
    const model = buildBoardViewModel(snapshot([child]), { tag: "ui", sort: "id-asc" });
    assert.deepEqual(visibleIds(model), ["child"]);
  });

  it("shows a matched issue that is also another match's ancestor exactly once", () => {
    const parent = issue({ id: "parent", title: "parent", tags: ["ui"] });
    const child = issue({
      id: "child",
      title: "child",
      parentId: "parent",
      depth: 1,
      tags: ["ui"],
    });
    const model = buildBoardViewModel(snapshot([parent, child]), { tag: "ui", sort: "id-asc" });
    assert.deepEqual(visibleIds(model), ["child", "parent"]);
  });

  it("leaves the unfiltered board unchanged when no tag filter is active", () => {
    const root = issue({ id: "root", title: "root" });
    const mid = issue({ id: "mid", title: "mid", parentId: "root", depth: 1, tags: ["ui"] });
    const other = issue({ id: "other", title: "other" });
    const model = buildBoardViewModel(snapshot([root, mid, other]), { tag: null, sort: "id-asc" });
    assert.deepEqual(visibleIds(model), ["mid", "other", "root"]);
  });

  it("hides untagged issues unrelated to any match", () => {
    const parent = issue({ id: "parent", title: "parent" });
    const tagged = issue({
      id: "tagged",
      title: "tagged",
      parentId: "parent",
      depth: 1,
      tags: ["ui"],
    });
    const stranger = issue({ id: "stranger", title: "stranger" });
    const model = buildBoardViewModel(snapshot([parent, tagged, stranger]), {
      tag: "ui",
      sort: "id-asc",
    });
    assert.deepEqual(visibleIds(model), ["parent", "tagged"]);
  });

  it("lands a pulled-in done parent in Delegated, folded on the full snapshot", () => {
    const parent = issue({ id: "parent", title: "parent", status: "done" });
    const child = issue({
      id: "kid",
      title: "kid",
      parentId: "parent",
      depth: 1,
      status: "read",
      tags: ["ui"],
    });
    const model = buildBoardViewModel(snapshot([parent, child]), { tag: "ui", sort: "id-asc" });
    assert.equal(columnOf(model, "parent"), "delegated");
    assert.equal(columnOf(model, "kid"), "read");
  });

  it("renders a pulled-in blocked parent in Blocked", () => {
    const parent = issue({ id: "parent", title: "parent", status: "blocked" });
    const child = issue({ id: "kid", title: "kid", parentId: "parent", depth: 1, tags: ["ui"] });
    const model = buildBoardViewModel(snapshot([parent, child]), { tag: "ui", sort: "id-asc" });
    assert.equal(columnOf(model, "parent"), "blocked");
    assert.equal(columnOf(model, "kid"), "backlog");
  });

  it("pulls both roots when two independent subtrees match", () => {
    const rootA = issue({ id: "roota", title: "a" });
    const kidA = issue({
      id: "kida",
      title: "ka",
      parentId: "roota",
      depth: 1,
      tags: ["ui"],
    });
    const rootB = issue({ id: "rootb", title: "b" });
    const kidB = issue({
      id: "kidb",
      title: "kb",
      parentId: "rootb",
      depth: 1,
      tags: ["ui"],
    });
    const model = buildBoardViewModel(snapshot([rootA, kidA, rootB, kidB]), {
      tag: "ui",
      sort: "id-asc",
    });
    assert.deepEqual(visibleIds(model), ["kida", "kidb", "roota", "rootb"]);
  });

  it("orders the expanded view by the sort, not the ancestor walk", () => {
    const leaf = issue({ id: "zzz", title: "z", parentId: "aaa", depth: 1, tags: ["ui"] });
    const mid = issue({ id: "mmm", title: "m", tags: ["ui"] });
    const root = issue({ id: "aaa", title: "a" });
    const model = buildBoardViewModel(snapshot([leaf, mid, root]), { tag: "ui", sort: "id-asc" });
    assert.deepEqual(visibleIds(model), ["aaa", "mmm", "zzz"]);
  });
});

describe("spec and free-text filters through the pipeline", () => {
  it("OR-matches any comma-OR term and still expands ancestors of the matches", () => {
    const root = issue({ id: "root", title: "root" });
    const child = issue({
      id: "child",
      title: "child",
      parentId: "root",
      depth: 1,
      tags: ["ui"],
    });
    const other = issue({ id: "other", title: "other", tags: ["board"] });
    const stranger = issue({ id: "stranger", title: "stranger", tags: ["unrelated"] });
    const model = buildBoardViewModel(snapshot([root, child, other, stranger]), {
      tag: null,
      sort: "id-asc",
      tagSpec: "ui,board",
    });
    assert.deepEqual(visibleIds(model), ["child", "other", "root"]);
  });

  it("intersects the dropdown tag with the spec terms instead of unifying them", () => {
    const uiOnly = issue({ id: "uionly", title: "uionly", tags: ["ui"] });
    const both = issue({ id: "both", title: "both", tags: ["ui", "board"] });
    const model = buildBoardViewModel(snapshot([uiOnly, both]), {
      tag: "ui",
      sort: "id-asc",
      tagSpec: "board",
    });
    assert.deepEqual(visibleIds(model), ["both"]);
  });

  it("filters by free text over a tag or the five-character short id", () => {
    const tagged = issue({ id: "aaaa1-x", title: "tagged", tags: ["todo-skill"] });
    const shortId = issue({ id: "10eb1-y", title: "by id" });
    const plain = issue({ id: "zzzz9-z", title: "plain" });
    assert.deepEqual(
      visibleIds(
        buildBoardViewModel(snapshot([tagged, shortId, plain]), {
          tag: null,
          sort: "id-asc",
          query: "SKILL",
        }),
      ),
      ["aaaa1-x"],
    );
    assert.deepEqual(
      visibleIds(
        buildBoardViewModel(snapshot([tagged, shortId, plain]), {
          tag: null,
          sort: "id-asc",
          query: "10eb",
        }),
      ),
      ["10eb1-y"],
    );
  });

  it("exposes epic buttons and ranked common tags on the view model", () => {
    const epicRoot = issue({
      id: "root",
      title: "root",
      tags: ["Epic", "ui"],
      epic: "found",
      rootHue: 210,
      updated: "2026-09-20T00:00:00.000Z",
    });
    const child = issue({
      id: "child",
      title: "child",
      parentId: "root",
      depth: 1,
      tags: ["board", "ui"],
      updated: "2026-09-10T00:00:00.000Z",
    });
    const model = buildBoardViewModel(snapshot([epicRoot, child]), DEFAULT_BOARD_UI_STATE);
    assert.deepEqual(model.epics, [{ epic: "found", hue: 210 }]);
    assert.deepEqual(model.commonTags, ["ui", "board"]);
    assert.deepEqual(model.tags, ["board", "Epic", "ui"]);
  });
});

describe("board view-model golden", () => {
  it("derives the whole render model from snapshot and ui state", () => {
    const issues = [
      issue({
        id: "root",
        title: "epic one",
        status: "doing",
        rootHue: 210,
        tags: ["ui"],
        updated: "2026-09-05T00:00:00.000Z",
        sections: {
          brief: { content: true, text: "brief" },
          reading: { content: false, marker: false },
          doing: { content: false, marker: false },
          log: { content: false },
          openQuestions: { content: true, hasOpen: true, hasHumanOpen: true },
        },
      }),
      issue({
        id: "child",
        title: "child task",
        status: "doing",
        parentId: "root",
        depth: 1,
        rootHue: 210,
        tags: ["ui"],
        updated: "2026-09-06T00:00:00.000Z",
      }),
      issue({
        id: "blocked",
        title: "waiting",
        status: "blocked",
        tags: ["ui"],
        links: { blocks: [], relates: [] },
      }),
      issue({
        id: "blocker",
        title: "the cause",
        status: "backlog",
        tags: ["ui"],
        links: { blocks: ["blocked"], relates: [] },
      }),
    ];
    const uiState = {
      tag: "ui",
      sort: "updated-desc",
    } as const;
    const model = buildBoardViewModel(snapshot(issues), uiState);
    assert.equal(model.root, "C:/repo/.todo");
    assert.equal(model.repoName, "repo");
    assert.deepEqual(model.tags, ["ui"]);
    assert.deepEqual(
      model.columns.map((column) => column.status),
      ["backlog", "read", "doing", "delegated", "blocked", "done", "cancelled"],
    );
    const doing = model.columns.find((column) => column.status === "doing")!;
    assert.deepEqual(
      doing.cards.map((card) => card.issue.id),
      ["child", "root"],
    );
    const childCard = doing.cards[0]!;
    assert.equal(childCard.glyph, "▶");
    assert.equal(childCard.badge, null);
    assert.deepEqual(childCard.parent, { id: "root", title: "epic one" });
    const rootCard = doing.cards[1]!;
    assert.equal(rootCard.badge, "human");
    assert.equal(rootCard.isRoot, true);
    const delegated = model.columns.find((column) => column.status === "delegated")!;
    assert.deepEqual(
      delegated.cards.map((card) => card.issue.id),
      [],
    );
    const blockedCard = model.columns
      .find((column) => column.status === "blocked")!
      .cards.find((card) => card.issue.id === "blocked")!;
    assert.deepEqual(blockedCard.blockedBy, [{ id: "blocker", title: "the cause" }]);
    assert.equal(blockedCard.tinted, false);
  });
});
