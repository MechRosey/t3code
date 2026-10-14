import { it, describe, expect } from "@effect/vitest";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as TodoBoard from "./TodoBoard.ts";
import { TodoBoardReadResult, type TodoBoardSnapshot } from "@t3tools/contracts";
import { ensureUnchanged } from "./issues.ts";
import { fixturesRoot, readFixture } from "./fixtures.ts";

const TestLayer = TodoBoard.layer.pipe(Layer.provideMerge(NodeServices.layer));

interface MidFlightWrite {
  readonly path: string;
  readonly content: string;
  count: number;
}

const midFlight: { current: MidFlightWrite | null } = { current: null };

const conflictLayer = Layer.effect(
  FileSystem.FileSystem,
  Effect.map(FileSystem.FileSystem, (inner) =>
    FileSystem.make({
      ...inner,
      stat: (path) => {
        const trap = midFlight.current;
        if (trap === null || path !== trap.path) return inner.stat(path);
        trap.count += 1;
        return trap.count === 2
          ? Effect.andThen(inner.writeFileString(trap.path, trap.content), inner.stat(path))
          : inner.stat(path);
      },
    }),
  ),
).pipe(Layer.provideMerge(NodeServices.layer));

const conflictTestLayer = TodoBoard.layer.pipe(Layer.provideMerge(conflictLayer));

const installBoard = (fixtureBoard: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-board-" });
    const boardDir = path.join(target, "project", ".todo");
    yield* fs.copy(path.join(fixturesRoot, fixtureBoard), boardDir);
    const cwd = path.join(target, "project", "sub", "deep");
    yield* fs.makeDirectory(cwd, { recursive: true });
    return { target, boardDir, cwd };
  });

const TodoPointerContent = Schema.Struct({
  central: Schema.String,
  board: Schema.optional(Schema.String),
  created: Schema.optional(Schema.String),
});

const pointerHtml = (content: typeof TodoPointerContent.Type): string =>
  `<!doctype html><script type="application/json" id="todo-pointer">${Schema.encodeSync(
    Schema.fromJsonString(TodoPointerContent),
  )(content)}</script>`;

const encodeTodoBoardReadResult = Schema.encodeEffect(TodoBoardReadResult);

const setBoardTime = (stamp: string) =>
  Effect.sync(() => {
    const zoned = DateTime.makeZonedUnsafe(`${stamp.replace(" ", "T")}:00`, {
      adjustForTimeZone: true,
    });
    return DateTime.toEpochMillis(zoned);
  }).pipe(Effect.flatMap((millis) => TestClock.setTime(millis)));

const expectSameBytes = (actual: Buffer, expected: Buffer) => {
  if (Buffer.compare(actual, expected) === 0) return;
  const a = actual.toString("utf8");
  const b = expected.toString("utf8");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      throw new Error(
        `byte diff at ${i}: actual ${JSON.stringify(a.slice(i - 40, i + 40))} vs expected ${JSON.stringify(b.slice(i - 40, i + 40))}`,
      );
    }
  }
  throw new Error(`length diff: actual ${a.length} vs expected ${b.length}`);
};

describe("TodoBoard service", () => {
  it.layer(TestLayer)("reads", (it) => {
    it.effect("resolves a container board from a nested cwd with the export shape", () =>
      Effect.gen(function* () {
        const { cwd } = yield* installBoard("board-before");
        const board = yield* TodoBoard.TodoBoard;
        const snapshot = yield* board.read({ cwd });
        expect(snapshot.repoName).toBe("project");
        expect(snapshot.root.replace(/\\/g, "/")).toContain("project/.todo");
        expect(snapshot.issues.length).toBe(16);
        const root = snapshot.issues.find((issue) => issue.id === "0f853-board-foundation");
        expect(root).toMatchObject({
          depth: 0,
          parentId: null,
          status: "backlog",
          archived: false,
        });
        expect(typeof root?.rootHue).toBe("number");
        expect(root?.sections.brief.content).toBe(false);
        const child = snapshot.issues.find((issue) => issue.id === "6ba55-parser-fidelity");
        expect(child).toMatchObject({ depth: 1, parentId: "0f853-board-foundation" });
        expect(child?.rootHue).toBe(root?.rootHue);
        expect(child?.markerPath.replace(/\\/g, "/")).toContain(
          "0f853-board-foundation/6ba55-parser-fidelity/6ba55-parser-fidelity.md",
        );
      }),
    );

    it.effect("carries an unknown status and a non-numeric colour through the read", () =>
      Effect.gen(function* () {
        const { cwd } = yield* installBoard("board-quirks");
        const board = yield* TodoBoard.TodoBoard;
        const snapshot = yield* board.read({ cwd });
        const quirk = snapshot.issues.find((issue) => issue.id === "89c1f-quirk-carrier");
        expect(quirk?.status).toBe("wip");
        expect(quirk?.rootHue).toBeNull();
        const hue = snapshot.issues.find((issue) => issue.id === "f4028-hue-carrier");
        expect(hue?.rootHue).toBe(60);
        const encoded = yield* encodeTodoBoardReadResult(snapshot);
        expect(encoded.issues.find((issue) => issue.id === "89c1f-quirk-carrier")?.status).toBe(
          "wip",
        );
      }),
    );

    it.effect("follows a .todo.html pointer to the central board", () =>
      Effect.gen(function* () {
        const { target, boardDir, cwd } = yield* installBoard("board-before");
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const centralBoard = path.join(target, "central", "key", ".todo");
        yield* fs.makeDirectory(path.dirname(centralBoard), { recursive: true });
        yield* fs.copy(boardDir, centralBoard);
        yield* fs.writeFileString(
          path.join(target, "project", ".todo.html"),
          pointerHtml({ central: centralBoard, board: "key", created: "2026-09-20 12:00" }),
        );
        const board = yield* TodoBoard.TodoBoard;
        const snapshot = yield* board.read({ cwd });
        expect(snapshot.root).toBe(centralBoard);
      }),
    );

    it.effect("fails loud on a dangling pointer", () =>
      Effect.gen(function* () {
        const { target, cwd } = yield* installBoard("board-before");
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString(
          path.join(target, "project", ".todo.html"),
          pointerHtml({ central: path.join(target, "missing", ".todo") }),
        );
        const board = yield* TodoBoard.TodoBoard;
        const error = yield* board.read({ cwd }).pipe(Effect.flip);
        expect(error.failure).toBe("pointer_dangling");
        expect(error.message).toBe(
          `Board pointer resolves to '${path.join(target, "missing", ".todo")}', which does not exist. The central board may have moved or been removed; re-register this repo or restore the board.`,
        );
      }),
    );

    it.effect("fails when no board resolves above the cwd", () =>
      Effect.gen(function* () {
        const { target } = yield* installBoard("board-before");
        const board = yield* TodoBoard.TodoBoard;
        const error = yield* board.read({ cwd: target }).pipe(Effect.flip);
        expect(error.failure).toBe("board_not_found");
      }),
    );

    it.effect("excludes archived subtrees from the read snapshot", () =>
      Effect.gen(function* () {
        const { cwd } = yield* installBoard("after-archive");
        const board = yield* TodoBoard.TodoBoard;
        const snapshot = yield* board.read({ cwd });
        expect(snapshot.issues.some((issue) => issue.id === "e0ae5-archive-target")).toBe(false);
        expect(snapshot.issues.some((issue) => issue.id === "df3cf-archive-child")).toBe(false);
        expect(snapshot.issues.some((issue) => issue.id === "e20d1-status-target")).toBe(true);
      }),
    );
  });

  it.layer(TestLayer)("reads the archive", (it) => {
    it.effect("reads each archived group as a whole-subtree snapshot", () =>
      Effect.gen(function* () {
        const { cwd } = yield* installBoard("after-archive");
        const board = yield* TodoBoard.TodoBoard;
        const archive = yield* board.readArchive({ cwd });
        expect(archive.repoName).toBe("project");
        expect(archive.boardRoot.replace(/\\/g, "/")).toContain("project/.todo");
        const group = archive.groups.find((entry) => entry.dirName === "e0ae5-archive-target");
        expect(group?.rootIssue).toMatchObject({
          id: "e0ae5-archive-target",
          title: "Archive target",
          status: "done",
          depth: 0,
          parentId: null,
          archived: true,
          rootHue: 270,
        });
        expect(group?.rootIssue?.markerPath.replace(/\\/g, "/")).toContain(
          "archive/e0ae5-archive-target/e0ae5-archive-target.md",
        );
        const child = group?.snapshot.issues.find((issue) => issue.id === "df3cf-archive-child");
        expect(child).toMatchObject({ archived: true, rootHue: 270 });
        expect(child?.markerPath.replace(/\\/g, "/")).toContain(
          "archive/e0ae5-archive-target/df3cf-archive-child/df3cf-archive-child.md",
        );
        expect(group?.snapshot.issues.length).toBe(2);
      }),
    );

    it.effect("keys duplicate-id groups by directory name, never issue id", () =>
      Effect.gen(function* () {
        const { cwd } = yield* installBoard("after-archive");
        const board = yield* TodoBoard.TodoBoard;
        const archive = yield* board.readArchive({ cwd });
        expect(archive.groups.map((group) => group.dirName)).toEqual([
          "9f7e2-orphan-group",
          "e0ae5-archive-target",
          "e0ae5-archive-target-2",
        ]);
        const dupes = archive.groups.filter((group) =>
          group.snapshot.issues.some((issue) => issue.id === "e0ae5-archive-target"),
        );
        expect(dupes.map((group) => group.dirName)).toEqual([
          "e0ae5-archive-target",
          "e0ae5-archive-target-2",
        ]);
        for (const group of dupes) {
          expect(group.rootIssue?.id).toBe("e0ae5-archive-target");
        }
      }),
    );

    it.effect("reports a marker-less group root as null and still reads its children", () =>
      Effect.gen(function* () {
        const { cwd } = yield* installBoard("after-archive");
        const board = yield* TodoBoard.TodoBoard;
        const archive = yield* board.readArchive({ cwd });
        const orphan = archive.groups.find((entry) => entry.dirName === "9f7e2-orphan-group");
        expect(orphan?.rootIssue).toBeNull();
        expect(orphan?.snapshot.issues.map((issue) => issue.id)).toEqual(["aa1b2-orphan-child"]);
      }),
    );

    it.effect("returns no groups for a board without an archive", () =>
      Effect.gen(function* () {
        const { cwd } = yield* installBoard("board-before");
        const board = yield* TodoBoard.TodoBoard;
        const archive = yield* board.readArchive({ cwd });
        expect(archive.groups).toEqual([]);
      }),
    );

    it.effect("keeps the archive read-only: mutations cannot reach an archived id", () =>
      Effect.gen(function* () {
        const { boardDir, cwd } = yield* installBoard("after-archive");
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const markerPath = path.join(
          boardDir,
          "archive",
          "e0ae5-archive-target-2",
          "e0ae5-archive-target.md",
        );
        const before = yield* fs.readFileString(markerPath);
        const board = yield* TodoBoard.TodoBoard;
        const failure = yield* board
          .mutate({ action: "tag", cwd, id: "e0ae5-archive-target", tag: "beta" })
          .pipe(Effect.flip);
        expect(failure.failure).toBe("issue_not_found");
        expect(yield* fs.readFileString(markerPath)).toBe(before);
      }),
    );
  });

  it.layer(TestLayer)("mutates", (it) => {
    it.effect("status writes the skill's exact bytes", () =>
      Effect.gen(function* () {
        const { boardDir, cwd } = yield* installBoard("board-before");
        yield* setBoardTime("2026-09-20 12:00");
        const board = yield* TodoBoard.TodoBoard;
        const result = yield* board.mutate({
          action: "status",
          cwd,
          id: "e20d1-status-target",
          status: "doing",
        });
        expect(result.issue.status).toBe("doing");
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const written = yield* fs.readFile(
          path.join(boardDir, "e20d1-status-target", "e20d1-status-target.md"),
        );
        expectSameBytes(
          Buffer.from(written),
          yield* readFixture("after-status/e20d1-status-target/e20d1-status-target.md"),
        );
      }),
    );

    it.effect("comment writes the skill's exact bytes", () =>
      Effect.gen(function* () {
        const { boardDir, cwd } = yield* installBoard("board-before");
        const golden = (yield* readFixture(
          "after-comment/762b5-comment-target/762b5-comment-target.md",
        )).toString("utf8");
        const stamp = /- \*\*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\*\*/.exec(golden)?.[1];
        expect(stamp).toBeDefined();
        yield* setBoardTime(stamp!);
        const board = yield* TodoBoard.TodoBoard;
        yield* board.mutate({
          action: "comment",
          cwd,
          id: "762b5-comment-target",
          text: "A comment lands here.",
          by: "tester",
        });
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const written = yield* fs.readFileString(
          path.join(boardDir, "762b5-comment-target", "762b5-comment-target.md"),
        );
        const expected = golden.replace("updated: 2026-09-20 12:00", `updated: ${stamp}`);
        expectSameBytes(Buffer.from(written, "utf8"), Buffer.from(expected, "utf8"));
      }),
    );

    it.effect("rollup writes the skill's exact bytes on the parent", () =>
      Effect.gen(function* () {
        const { boardDir, cwd } = yield* installBoard("board-before");
        yield* setBoardTime("2026-09-20 12:00");
        const board = yield* TodoBoard.TodoBoard;
        const result = yield* board.mutate({
          action: "rollup",
          cwd,
          id: "0fef4-rollup-grandchild",
          status: "done",
          text: "Resolved cleanly",
        });
        expect(result.issue.id).toBe("e594b-rollup-child");
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const written = yield* fs.readFileString(
          path.join(boardDir, "e594b-rollup-child", "e594b-rollup-child.md"),
        );
        expectSameBytes(
          Buffer.from(written, "utf8"),
          yield* readFixture("after-rollup/e594b-rollup-child/e594b-rollup-child.md"),
        );
      }),
    );

    it.effect(
      "refuses to close a parent with open children and archives only closed subtrees",
      () =>
        Effect.gen(function* () {
          const { boardDir, cwd } = yield* installBoard("board-before");
          yield* setBoardTime("2026-09-20 12:00");
          const board = yield* TodoBoard.TodoBoard;
          const guarded = yield* board
            .mutate({ action: "status", cwd, id: "e594b-rollup-child", status: "done" })
            .pipe(Effect.flip);
          expect(guarded.failure).toBe("open_children");
          expect(guarded.message).toBe(
            "Cannot set e594b-rollup-child to done - it has open children:\n  0fef4-rollup-grandchild [backlog]\nUse -Force to override.",
          );
          const forced = yield* board.mutate({
            action: "status",
            cwd,
            id: "e594b-rollup-child",
            status: "done",
            force: true,
          });
          expect(forced.issue.status).toBe("done");
          const openArchive = yield* board
            .mutate({ action: "archive", cwd, id: "e594b-rollup-child" })
            .pipe(Effect.flip);
          expect(openArchive.failure).toBe("subtree_open");
          expect(openArchive.message).toBe(
            "Cannot archive e594b-rollup-child - subtree has open issues:\n  0fef4-rollup-grandchild [backlog]",
          );
          yield* board.mutate({
            action: "status",
            cwd,
            id: "0fef4-rollup-grandchild",
            status: "done",
          });
          yield* board.mutate({ action: "archive", cwd, id: "e594b-rollup-child" });
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const archived = yield* fs.exists(path.join(boardDir, "archive", "e594b-rollup-child"));
          expect(archived).toBe(true);
          expect(yield* fs.exists(path.join(boardDir, "e594b-rollup-child"))).toBe(false);
        }),
    );

    it.effect("migrates a drifted marker name to the canonical name on mutation", () =>
      Effect.gen(function* () {
        const { boardDir, cwd } = yield* installBoard("board-drift");
        yield* setBoardTime("2026-09-20 13:43");
        const board = yield* TodoBoard.TodoBoard;
        const result = yield* board.mutate({
          action: "tag",
          cwd,
          id: "a4be6-drift-target",
          tag: "beta",
        });
        expect(result.issue.markerPath.replace(/\\/g, "/")).toContain(
          "a4be6-drift-target/a4be6-drift-target.md",
        );
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const canonical = path.join(boardDir, "a4be6-drift-target", "a4be6-drift-target.md");
        expectSameBytes(
          Buffer.from(yield* fs.readFile(canonical)),
          yield* readFixture("after-tag-drift/a4be6-drift-target/a4be6-drift-target.md"),
        );
        expect(
          yield* fs.exists(
            path.join(boardDir, "a4be6-drift-target", "a4be6-drift-target-renamed.md"),
          ),
        ).toBe(false);
      }),
    );

    it.effect("reports an ambiguous id instead of picking one", () =>
      Effect.gen(function* () {
        const { cwd } = yield* installBoard("board-before");
        const board = yield* TodoBoard.TodoBoard;
        const error = yield* board
          .mutate({ action: "tag", cwd, id: "e", tag: "x" })
          .pipe(Effect.flip);
        expect(error.failure).toBe("ambiguous_issue_id");
      }),
    );

    it.effect("serializes concurrent mutations so both land", () =>
      Effect.gen(function* () {
        const { boardDir, cwd } = yield* installBoard("board-before");
        yield* setBoardTime("2026-09-20 12:00");
        const board = yield* TodoBoard.TodoBoard;
        yield* Effect.all(
          [
            board.mutate({ action: "tag", cwd, id: "762b5-comment-target", tag: "beta" }),
            board.mutate({
              action: "comment",
              cwd,
              id: "762b5-comment-target",
              text: "Landed while a tag was in flight.",
            }),
          ],
          { concurrency: 2 },
        );
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const written = yield* fs.readFileString(
          path.join(boardDir, "762b5-comment-target", "762b5-comment-target.md"),
        );
        expect(written).toContain("tags: [beta]");
        expect(written).toContain("Landed while a tag was in flight.");
      }),
    );

    it.effect("applies a mutation to fresh content written after the caller last read", () =>
      Effect.gen(function* () {
        const { boardDir, cwd } = yield* installBoard("board-before");
        yield* setBoardTime("2026-09-20 12:00");
        const board = yield* TodoBoard.TodoBoard;
        yield* board.read({ cwd });
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const markerPath = path.join(boardDir, "762b5-comment-target", "762b5-comment-target.md");
        const original = yield* fs.readFileString(markerPath);
        const external = original.replace("## Links", "## Links\n\n- hand edit by the skill");
        yield* fs.writeFileString(markerPath, external);
        yield* board.mutate({ action: "tag", cwd, id: "762b5-comment-target", tag: "beta" });
        const written = yield* fs.readFileString(markerPath);
        expect(written).toContain("hand edit by the skill");
        expect(written).toContain("tags: [beta]");
      }),
    );
  });
});

describe("ensureUnchanged", () => {
  it("accepts an unchanged marker file and rejects a changed one", () => {
    expect(() => ensureUnchanged({ mtimeMs: 5, size: 10 }, { mtimeMs: 5, size: 10 })).not.toThrow();
    expect(() => ensureUnchanged({ mtimeMs: 5, size: 10 }, { mtimeMs: 6, size: 10 })).toThrow();
    expect(() => ensureUnchanged({ mtimeMs: 5, size: 10 }, { mtimeMs: 5, size: 11 })).toThrow();
  });
});

describe("mid-flight conflict", () => {
  it.effect("surfaces a mid-flight external write as a typed conflict failure", () =>
    Effect.gen(function* () {
      const { boardDir, cwd } = yield* installBoard("board-before");
      yield* setBoardTime("2026-09-20 12:00");
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const markerPath = path.join(boardDir, "762b5-comment-target", "762b5-comment-target.md");
      const original = yield* fs.readFileString(markerPath);
      midFlight.current = {
        path: markerPath,
        content: original.replace("## Links", "## Links\n\n- mid-flight external edit"),
        count: 0,
      };
      const board = yield* TodoBoard.TodoBoard;
      const failure = yield* board
        .mutate({ action: "tag", cwd, id: "762b5-comment-target", tag: "beta" })
        .pipe(Effect.flip);
      expect(failure.failure).toBe("conflict");
      const written = yield* fs.readFileString(markerPath);
      expect(written).toContain("mid-flight external edit");
      expect(written).not.toContain("tags: [beta]");
    }).pipe(Effect.provide(conflictTestLayer)),
  );
});

describe("board watching", () => {
  it.live(
    "streams the snapshot first and again after every change, then releases the watcher",
    () =>
      Effect.gen(function* () {
        const { boardDir, cwd } = yield* installBoard("board-before");
        const board = yield* TodoBoard.TodoBoard;
        const seen = yield* Queue.unbounded<TodoBoardSnapshot>();
        yield* Stream.runForEach(board.stream({ cwd }), (snapshot) =>
          Queue.offer(seen, snapshot),
        ).pipe(Effect.forkScoped);

        const first = yield* Queue.take(seen);
        expect(first.issues.length).toBe(16);

        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const markerPath = path.join(boardDir, "762b5-comment-target", "762b5-comment-target.md");
        const original = yield* fs.readFileString(markerPath);
        const external = original.replace("## Links", "## Links\n\n- watcher probe edit");
        yield* fs.writeFileString(markerPath, external);

        const second = yield* Queue.take(seen);
        const changed = second.issues.find((issue) => issue.id === "762b5-comment-target");
        expect(changed?.body).toContain("watcher probe edit");
      }).pipe(Effect.timeout("30 seconds"), Effect.scoped, Effect.provide(TestLayer)),
  );
});
