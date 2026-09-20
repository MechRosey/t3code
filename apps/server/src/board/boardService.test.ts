import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { it, describe, expect } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";

import * as TodoBoard from "./TodoBoard.ts";
import { ensureUnchanged } from "./issues.ts";
import { fixturesRoot, readFixture } from "./fixtures.ts";

const TestLayer = TodoBoard.layer.pipe(Layer.provideMerge(NodeServices.layer));

const installBoard = (fixtureBoard: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const target = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-board-" });
    const boardDir = NodePath.join(target, "project", ".todo");
    NodeFS.cpSync(NodePath.join(fixturesRoot, fixtureBoard), boardDir, { recursive: true });
    const cwd = NodePath.join(target, "project", "sub", "deep");
    NodeFS.mkdirSync(cwd, { recursive: true });
    return { target, boardDir, cwd };
  });

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

    it.effect("follows a .todo.html pointer to the central board", () =>
      Effect.gen(function* () {
        const { target, boardDir, cwd } = yield* installBoard("board-before");
        const centralBoard = NodePath.join(target, "central", "key", ".todo");
        NodeFS.mkdirSync(NodePath.dirname(centralBoard), { recursive: true });
        NodeFS.cpSync(boardDir, centralBoard, { recursive: true });
        NodeFS.writeFileSync(
          NodePath.join(target, "project", ".todo.html"),
          `<!doctype html><script type="application/json" id="todo-pointer">${JSON.stringify({
            central: centralBoard,
            board: "key",
            created: "2026-09-20 12:00",
          })}</script>`,
        );
        const board = yield* TodoBoard.TodoBoard;
        const snapshot = yield* board.read({ cwd });
        expect(snapshot.root).toBe(centralBoard);
      }),
    );

    it.effect("fails loud on a dangling pointer", () =>
      Effect.gen(function* () {
        const { target, cwd } = yield* installBoard("board-before");
        NodeFS.writeFileSync(
          NodePath.join(target, "project", ".todo.html"),
          `<!doctype html><script type="application/json" id="todo-pointer">${JSON.stringify({
            central: NodePath.join(target, "missing", ".todo"),
          })}</script>`,
        );
        const board = yield* TodoBoard.TodoBoard;
        const error = yield* board.read({ cwd }).pipe(Effect.flip);
        expect(error.failure).toBe("pointer_dangling");
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
        const written = NodeFS.readFileSync(
          NodePath.join(boardDir, "e20d1-status-target", "e20d1-status-target.md"),
        );
        expectSameBytes(
          written,
          readFixture("after-status/e20d1-status-target/e20d1-status-target.md"),
        );
      }),
    );

    it.effect("comment writes the skill's exact bytes", () =>
      Effect.gen(function* () {
        const { boardDir, cwd } = yield* installBoard("board-before");
        const golden = readFixture(
          "after-comment/762b5-comment-target/762b5-comment-target.md",
        ).toString("utf8");
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
        const written = NodeFS.readFileSync(
          NodePath.join(boardDir, "762b5-comment-target", "762b5-comment-target.md"),
        );
        const expected = golden.replace("updated: 2026-09-20 12:00", `updated: ${stamp}`);
        expectSameBytes(written, Buffer.from(expected, "utf8"));
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
        const written = NodeFS.readFileSync(
          NodePath.join(boardDir, "e594b-rollup-child", "e594b-rollup-child.md"),
        );
        expectSameBytes(
          written,
          readFixture("after-rollup/e594b-rollup-child/e594b-rollup-child.md"),
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
          yield* board.mutate({
            action: "status",
            cwd,
            id: "0fef4-rollup-grandchild",
            status: "done",
          });
          yield* board.mutate({ action: "archive", cwd, id: "e594b-rollup-child" });
          expect(NodeFS.existsSync(NodePath.join(boardDir, "archive", "e594b-rollup-child"))).toBe(
            true,
          );
          expect(NodeFS.existsSync(NodePath.join(boardDir, "e594b-rollup-child"))).toBe(false);
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
        const written = NodeFS.readFileSync(
          NodePath.join(boardDir, "762b5-comment-target", "762b5-comment-target.md"),
        ).toString("utf8");
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
        const markerPath = NodePath.join(
          boardDir,
          "762b5-comment-target",
          "762b5-comment-target.md",
        );
        const external = NodeFS.readFileSync(markerPath, "utf8").replace(
          "## Links",
          "## Links\n\n- hand edit by the skill",
        );
        NodeFS.writeFileSync(markerPath, external);
        yield* board.mutate({ action: "tag", cwd, id: "762b5-comment-target", tag: "beta" });
        const written = NodeFS.readFileSync(markerPath, "utf8");
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

describe("board watching", () => {
  it.live(
    "streams the snapshot first and again after every change, then releases the watcher",
    () =>
      Effect.gen(function* () {
        const { boardDir, cwd } = yield* installBoard("board-before");
        const board = yield* TodoBoard.TodoBoard;
        const seen = yield* Queue.unbounded<TodoBoard.TodoBoardSnapshot>();
        yield* Stream.runForEach(board.stream({ cwd }), (snapshot) =>
          Queue.offer(seen, snapshot),
        ).pipe(Effect.forkScoped);

        const first = yield* Queue.take(seen);
        expect(first.issues.length).toBe(16);

        const markerPath = NodePath.join(
          boardDir,
          "762b5-comment-target",
          "762b5-comment-target.md",
        );
        const external = NodeFS.readFileSync(markerPath, "utf8").replace(
          "## Links",
          "## Links\n\n- watcher probe edit",
        );
        NodeFS.writeFileSync(markerPath, external);

        const second = yield* Queue.take(seen);
        const changed = second.issues.find((issue) => issue.id === "762b5-comment-target");
        expect(changed?.body).toContain("watcher probe edit");
      }).pipe(Effect.timeout("30 seconds"), Effect.scoped, Effect.provide(TestLayer)),
  );
});
