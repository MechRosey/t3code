import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import {
  type TodoBoardMutateInput,
  type TodoBoardSnapshot,
  TodoBoardError,
  type TodoIssue,
} from "@t3tools/contracts";

import { parseIssue, serializeIssue, type BoardIssue } from "./frontmatter.ts";
import {
  ensureUnchanged,
  findIssueDirName,
  isArchivedPath,
  isIssueMarkerFile,
  MarkerConflictError,
  repoDisplayName,
  resolveLinkId,
} from "./issues.ts";
import {
  applyComment,
  applyLink,
  applyRollup,
  applyStatus,
  applyTag,
  assertStatusChildrenGuard,
  assertSubtreeClosed,
  BoardRuleError,
} from "./mutations.ts";
import { getSectionMap, type IssueSections } from "./sections.ts";
import { canonicalStatus } from "./vocabulary.ts";

type TodoBoardFailure = TodoBoardError["failure"];

interface MarkerStat {
  readonly mtimeMs: number;
  readonly size: number;
}

interface IssueDir {
  readonly name: string;
  readonly rel: string;
  readonly markerRel: string;
}

interface WatchEntry {
  refCount: number;
  readonly scope: Scope.Closeable;
  readonly changes: PubSub.PubSub<{ readonly seq: number; readonly snapshot: TodoBoardSnapshot }>;
  readonly state: Ref.Ref<{ seq: number; snapshot: TodoBoardSnapshot | null }>;
}

const POINTER_FILE = ".todo.html";
const POINTER_PATTERN = /<script\b[^>]*\bid="todo-pointer"[^>]*>([\s\S]*?)<\/script>/;

export class TodoBoard extends Context.Service<
  TodoBoard,
  {
    readonly read: (input: {
      readonly cwd: string;
    }) => Effect.Effect<TodoBoardSnapshot, TodoBoardError>;
    readonly mutate: (
      input: TodoBoardMutateInput,
    ) => Effect.Effect<{ readonly issue: TodoIssue }, TodoBoardError>;
    readonly stream: (input: {
      readonly cwd: string;
    }) => Stream.Stream<TodoBoardSnapshot, TodoBoardError>;
  }
>()("t3/board/TodoBoard") {}

const toSections = (sections: IssueSections): TodoIssue["sections"] => ({
  brief: { content: sections.brief.content, text: sections.brief.text },
  reading: { content: sections.reading.content, marker: sections.reading.marker },
  doing: { content: sections.doing.content, marker: sections.doing.marker },
  log: { content: sections.log.content },
  openQuestions: sections.openQuestions,
});

const toError = (failure: TodoBoardFailure, message: string, cause?: unknown): TodoBoardError =>
  new TodoBoardError({
    failure,
    message,
    ...(cause !== undefined ? { cause } : {}),
  });

const fromRuleError = (error: BoardRuleError): TodoBoardError =>
  toError(error.failure, error.message);

const normalizeSlashes = (value: string): string => value.replace(/\\/g, "/");

const runRule = <A>(thunk: () => A): Effect.Effect<A, TodoBoardError> =>
  Effect.suspend(() => {
    try {
      return Effect.succeed(thunk());
    } catch (error) {
      if (error instanceof BoardRuleError) return Effect.fail(fromRuleError(error));
      if (error instanceof MarkerConflictError) {
        return Effect.fail(
          toError("conflict", error.message, { baseline: error.baseline, current: error.current }),
        );
      }
      return Effect.die(error);
    }
  });

export const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const localZone = DateTime.zoneMakeLocal();
  const locks = yield* Ref.make(new Map<string, Semaphore.Semaphore>());
  const watchers = yield* Ref.make(new Map<string, WatchEntry>());
  const watcherGate = yield* Semaphore.make(1);

  const withLock = <A, E, R>(root: string, effect: Effect.Effect<A, E, R>) =>
    Effect.flatMap(
      Ref.modify(locks, (map) => {
        const existing = map.get(root);
        if (existing) return [existing, map] as const;
        const semaphore = Semaphore.makeUnsafe(1);
        return [semaphore, new Map(map).set(root, semaphore)] as const;
      }),
      (semaphore) => semaphore.withPermits(1)(effect),
    );

  const statInfo = (absolute: string) =>
    fs
      .stat(absolute)
      .pipe(
        Effect.mapError((cause) =>
          toError("operation_failed", `Failed to stat ${absolute}`, cause),
        ),
      );

  const markerStat = (
    absolute: string,
    info: { readonly mtime: Option.Option<Date>; readonly size: unknown },
  ): Effect.Effect<MarkerStat, TodoBoardError> =>
    Option.match(info.mtime, {
      onSome: (mtime) => Effect.succeed({ mtimeMs: mtime.getTime(), size: Number(info.size) }),
      onNone: () =>
        Effect.fail(toError("operation_failed", `Failed to stat ${absolute}: no mtime`)),
    });

  const existsDirectory = (candidate: string): Effect.Effect<boolean> =>
    Effect.map(statInfo(candidate), (info) => info.type === "Directory").pipe(
      Effect.catch(() => Effect.succeed(false)),
    );

  const readPointer = (dir: string): Effect.Effect<string | null> =>
    Effect.flatMap(fs.readFileString(path.join(dir, POINTER_FILE)), (html) => {
      const match = POINTER_PATTERN.exec(html);
      if (!match) return Effect.succeed(null);
      try {
        const parsed = JSON.parse((match[1] ?? "").trim()) as { central?: unknown };
        return Effect.succeed(typeof parsed.central === "string" ? parsed.central : null);
      } catch {
        return Effect.succeed(null);
      }
    }).pipe(Effect.catch(() => Effect.succeed(null)));

  const resolveRoot = (cwd: string): Effect.Effect<string, TodoBoardError> =>
    Effect.gen(function* () {
      if (!path.isAbsolute(cwd)) {
        return yield* toError("cwd_not_directory", `cwd must be an absolute path: ${cwd}`);
      }
      if (!(yield* existsDirectory(cwd))) {
        return yield* toError("cwd_not_directory", `cwd is not a directory: ${cwd}`);
      }
      let dir = cwd.replace(/[\\/]+$/, "");
      const separator = dir.includes("/") ? "/" : "\\";
      while (dir !== "") {
        const pointer = yield* readPointer(dir);
        if (pointer !== null) {
          if (!(yield* existsDirectory(pointer))) {
            return yield* toError(
              "pointer_dangling",
              `Board pointer resolves to '${pointer}', which does not exist.`,
            );
          }
          return pointer;
        }
        const inPlace = path.join(dir, ".todo");
        if (yield* existsDirectory(inPlace)) return inPlace;
        const index = dir.lastIndexOf(separator);
        if (index < 0) break;
        const parent = dir.slice(0, index);
        if (parent === dir) break;
        dir = parent;
      }
      return yield* toError("board_not_found", `No .todo/ found at or above ${cwd}.`);
    });

  const listIssueDirs = (root: string): Effect.Effect<ReadonlyArray<IssueDir>, TodoBoardError> =>
    Effect.gen(function* () {
      const entries = yield* fs
        .readDirectory(root, { recursive: true })
        .pipe(
          Effect.mapError((cause) => toError("operation_failed", `Failed to list ${root}`, cause)),
        );
      const files = entries
        .map((entry) => normalizeSlashes(entry))
        .filter((entry) => entry.endsWith(".md"))
        .filter((entry) => !isArchivedPath(root, path.join(root, entry)));
      const markers = new Map<string, string>();
      for (const file of files.toSorted()) {
        const segments = file.split("/");
        if (segments.length < 2) continue;
        const dirName = segments[segments.length - 2] ?? "";
        const baseName = (segments[segments.length - 1] ?? "").replace(/\.md$/, "");
        if (!isIssueMarkerFile(dirName, baseName)) continue;
        const dirRel = segments.slice(0, -1).join("/");
        if (!markers.has(dirRel)) markers.set(dirRel, file);
      }
      return [...markers.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([rel, markerRel]) => ({ name: rel.split("/").pop() ?? rel, rel, markerRel }));
    });

  const readMarker = (
    root: string,
    dir: IssueDir,
  ): Effect.Effect<{ text: string; stat: MarkerStat }, TodoBoardError> =>
    Effect.gen(function* () {
      const absolute = path.join(root, dir.markerRel);
      const text = yield* fs
        .readFileString(absolute)
        .pipe(
          Effect.mapError((cause) =>
            toError("operation_failed", `Failed to read ${absolute}`, cause),
          ),
        );
      const info = yield* statInfo(absolute);
      const stat = yield* markerStat(absolute, info);
      return { text, stat };
    });

  const writeMarker = (
    root: string,
    dir: IssueDir,
    next: BoardIssue,
    baseline: MarkerStat,
  ): Effect.Effect<void, TodoBoardError> =>
    Effect.gen(function* () {
      const absolute = path.join(root, dir.markerRel);
      const info = yield* statInfo(absolute);
      const current = yield* markerStat(absolute, info);
      yield* runRule(() => ensureUnchanged(baseline, current));
      yield* fs
        .writeFileString(absolute, serializeIssue(next))
        .pipe(
          Effect.mapError((cause) =>
            toError("operation_failed", `Failed to write ${absolute}`, cause),
          ),
        );
    });

  const readBoardAt = (root: string): Effect.Effect<TodoBoardSnapshot, TodoBoardError> =>
    Effect.gen(function* () {
      const dirs = yield* listIssueDirs(root);
      const active = dirs;
      const knownIds = active.map((dir) => dir.name);
      const rootHues = new Map<string, number | null>();
      const issues: Array<TodoIssue> = [];
      for (const dir of active) {
        const { text } = yield* readMarker(root, dir);
        const parsed = parseIssue(text, dir.name);
        if (dir.rel.split("/").length === 1) {
          rootHues.set(dir.name, parsed.fm.colour !== undefined ? Number(parsed.fm.colour) : null);
        }
        const segments = dir.rel.split("/");
        const depth = segments.length - 1;
        const rootId = segments[0] ?? "";
        issues.push({
          id: parsed.fm.id,
          title: parsed.fm.title,
          status: canonicalStatus(parsed.fm.status) as TodoIssue["status"],
          created: parsed.fm.created,
          updated: parsed.fm.updated,
          tags: [...parsed.fm.tags],
          epic: parsed.fm.epic ?? null,
          parentId: depth >= 1 ? (segments[depth - 1] ?? null) : null,
          depth,
          rootHue: rootHues.get(rootId) ?? null,
          markerPath: normalizeSlashes(path.join(root, dir.markerRel)),
          archived: false,
          sections: toSections(getSectionMap(parsed.body)),
          body: parsed.body,
          links: {
            blocks: parsed.fm.links.blocks.map((ref) => resolveLinkId(ref, knownIds)),
            relates: parsed.fm.links.relates.map((ref) => resolveLinkId(ref, knownIds)),
          },
        });
      }
      return { root, repoName: repoDisplayName(root), issues };
    });

  const nowStamp = Effect.map(DateTime.now, (now) => {
    const parts = DateTime.toParts(DateTime.setZone(now, localZone));
    const pad = (value: number, width = 2) => String(value).padStart(width, "0");
    return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
  });

  const findTarget = (
    dirs: ReadonlyArray<IssueDir>,
    id: string,
  ): Effect.Effect<IssueDir, TodoBoardError> => {
    const lookup = findIssueDirName(
      dirs.map((dir) => dir.name),
      id,
    );
    if (lookup.tag === "ambiguous") {
      return Effect.fail(
        toError(
          "ambiguous_issue_id",
          `Ambiguous id '${id}' matches: ${lookup.matches?.join(", ")}`,
        ),
      );
    }
    if (lookup.tag !== "found") {
      return Effect.fail(toError("issue_not_found", `Issue not found: ${id}`));
    }
    const target = dirs.find((dir) => dir.name === lookup.name);
    return target
      ? Effect.succeed(target)
      : Effect.fail(toError("issue_not_found", `Issue not found: ${id}`));
  };

  const rebuildFromDisk = (root: string, id: string) =>
    Effect.gen(function* () {
      const snapshot = yield* readBoardAt(root);
      const issue = snapshot.issues.find((entry) => entry.id === id);
      if (!issue) {
        return yield* Effect.fail(
          toError("issue_not_found", `Issue not found after mutation: ${id}`),
        );
      }
      return issue;
    });

  const mutateAt = (
    root: string,
    input: TodoBoardMutateInput,
  ): Effect.Effect<{ issue: TodoIssue }, TodoBoardError> =>
    Effect.gen(function* () {
      const dirs = yield* listIssueDirs(root);
      const target = yield* findTarget(dirs, input.id);
      const now = yield* nowStamp;

      switch (input.action) {
        case "status": {
          const childStatuses: Array<string> = [];
          const prefix = `${target.rel}/`;
          for (const dir of dirs) {
            if (!dir.rel.startsWith(prefix)) continue;
            if (dir.rel.slice(prefix.length).includes("/")) continue;
            const { text } = yield* readMarker(root, dir);
            childStatuses.push(parseIssue(text, dir.name).fm.status);
          }
          yield* runRule(() => assertStatusChildrenGuard(input.status, childStatuses, input.force));
          const { text, stat } = yield* readMarker(root, target);
          const parsed = parseIssue(text, target.name);
          const next = yield* runRule(() => applyStatus(parsed, { status: input.status }, now));
          yield* writeMarker(root, target, next, stat);
          return { issue: yield* rebuildFromDisk(root, parsed.fm.id) };
        }
        case "comment": {
          const { text, stat } = yield* readMarker(root, target);
          const parsed = parseIssue(text, target.name);
          const next = applyComment(
            parsed,
            { text: input.text, ...(input.by !== undefined ? { by: input.by } : {}) },
            now,
            now,
          );
          yield* writeMarker(root, target, next, stat);
          return { issue: yield* rebuildFromDisk(root, parsed.fm.id) };
        }
        case "tag": {
          const { text, stat } = yield* readMarker(root, target);
          const parsed = parseIssue(text, target.name);
          const next = applyTag(
            parsed,
            { tag: input.tag, ...(input.remove !== undefined ? { remove: input.remove } : {}) },
            now,
          );
          yield* writeMarker(root, target, next, stat);
          return { issue: yield* rebuildFromDisk(root, parsed.fm.id) };
        }
        case "link": {
          const knownIds = dirs.map((dir) => dir.name);
          let canonicalTargetId: string | undefined;
          if (!input.remove) {
            canonicalTargetId = yield* findTarget(dirs, input.target).pipe(
              Effect.map((dir) => dir.name),
            );
          }
          const { text, stat } = yield* readMarker(root, target);
          const parsed = parseIssue(text, target.name);
          const next = yield* runRule(() =>
            applyLink(
              parsed,
              {
                type: input.type,
                target: input.target,
                ...(input.remove !== undefined ? { remove: input.remove } : {}),
              },
              now,
              knownIds,
              canonicalTargetId,
            ),
          );
          yield* writeMarker(root, target, next, stat);
          return { issue: yield* rebuildFromDisk(root, parsed.fm.id) };
        }
        case "rollup": {
          const childSegments = target.rel.split("/");
          if (childSegments.length < 2) {
            return yield* Effect.fail(
              toError("no_parent", `Issue ${input.id} has no parent issue.`),
            );
          }
          const parentRel = childSegments.slice(0, -1).join("/");
          const parentDir = dirs.find((dir) => dir.rel === parentRel);
          if (!parentDir) {
            return yield* Effect.fail(
              toError("no_parent", `Issue ${input.id} has no parent issue.`),
            );
          }
          const child = yield* readMarker(root, target);
          const childParsed = parseIssue(child.text, target.name);
          const parent = yield* readMarker(root, parentDir);
          const parentParsed = parseIssue(parent.text, parentDir.name);
          const next = applyRollup(
            parentParsed,
            { id: childParsed.fm.id, title: childParsed.fm.title },
            { status: input.status, text: input.text },
            now,
          );
          yield* writeMarker(root, parentDir, next, parent.stat);
          return { issue: yield* rebuildFromDisk(root, parentParsed.fm.id) };
        }
        case "archive": {
          const subtree = dirs.filter(
            (dir) => dir.rel === target.rel || dir.rel.startsWith(`${target.rel}/`),
          );
          const statuses: Array<string> = [];
          for (const member of subtree) {
            const { text } = yield* readMarker(root, member);
            statuses.push(parseIssue(text, member.name).fm.status);
          }
          yield* runRule(() => assertSubtreeClosed(statuses));
          const before = yield* rebuildFromDisk(root, target.name);
          const archiveRoot = path.join(root, "archive");
          yield* fs
            .makeDirectory(archiveRoot, { recursive: true })
            .pipe(
              Effect.mapError((cause) =>
                toError("operation_failed", `Failed to create ${archiveRoot}`, cause),
              ),
            );
          let dest = path.join(archiveRoot, target.name);
          let suffix = 2;
          for (;;) {
            if (!(yield* existsDirectory(dest))) break;
            dest = path.join(archiveRoot, `${target.name}-${suffix}`);
            suffix += 1;
          }
          yield* fs
            .rename(path.join(root, target.rel), dest)
            .pipe(
              Effect.mapError((cause) =>
                toError("operation_failed", `Failed to archive ${target.name}`, cause),
              ),
            );
          return {
            issue: {
              ...before,
              archived: true,
              markerPath: normalizeSlashes(path.join(dest, `${target.name}.md`)),
            },
          };
        }
      }
    });

  const startWatcher = (root: string, entry: WatchEntry) =>
    Stream.runForEach(
      fs.watch(root, { recursive: true }).pipe(Stream.debounce(Duration.millis(100))),
      () =>
        Effect.gen(function* () {
          const snapshot = yield* readBoardAt(root).pipe(Effect.orElseSucceed(() => null));
          if (snapshot === null) return;
          const [publish, nextSeq] = yield* Ref.modify(
            entry.state,
            (
              state,
            ): readonly [
              readonly [boolean, number],
              { seq: number; snapshot: TodoBoardSnapshot | null },
            ] => {
              if (state.snapshot !== null && Equal.equals(state.snapshot, snapshot)) {
                return [[false, state.seq], state];
              }
              const updated = { seq: state.seq + 1, snapshot };
              return [[true, updated.seq], updated];
            },
          );
          if (publish) {
            yield* PubSub.publish(entry.changes, { seq: nextSeq, snapshot }).pipe(Effect.asVoid);
          }
        }),
    ).pipe(Effect.ignoreCause({ log: true }), Effect.forkIn(entry.scope));

  const acquireWatch = (cwd: string) =>
    watcherGate.withPermits(1)(
      Effect.gen(function* () {
        const root = yield* resolveRoot(cwd);
        const existing = (yield* Ref.get(watchers)).get(root);
        if (existing !== undefined) {
          const entry: WatchEntry = { ...existing, refCount: existing.refCount + 1 };
          yield* Ref.update(watchers, (map) => new Map(map).set(root, entry));
          return { root, entry };
        }
        const scope = yield* Scope.make();
        const changes = yield* PubSub.sliding<{
          readonly seq: number;
          readonly snapshot: TodoBoardSnapshot;
        }>(1);
        const entry: WatchEntry = {
          refCount: 1,
          scope,
          changes,
          state: yield* Ref.make<{ seq: number; snapshot: TodoBoardSnapshot | null }>({
            seq: 0,
            snapshot: null,
          }),
        };
        yield* Ref.update(watchers, (map) => new Map(map).set(root, entry));
        yield* startWatcher(root, entry);
        return { root, entry };
      }),
    );

  const releaseWatch = (root: string) =>
    watcherGate.withPermits(1)(
      Effect.gen(function* () {
        const current = (yield* Ref.get(watchers)).get(root);
        if (current === undefined) return;
        if (current.refCount > 1) {
          yield* Ref.update(watchers, (map) =>
            new Map(map).set(root, { ...current, refCount: current.refCount - 1 }),
          );
          return;
        }
        yield* Ref.update(watchers, (map) => {
          const next = new Map(map);
          next.delete(root);
          return next;
        });
        yield* Scope.close(current.scope, Exit.void);
      }),
    );

  return TodoBoard.of({
    read: (input) => Effect.flatMap(resolveRoot(input.cwd), readBoardAt),
    mutate: (input) =>
      Effect.flatMap(resolveRoot(input.cwd), (root) => withLock(root, mutateAt(root, input))),
    stream: (input) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const { root, entry } = yield* acquireWatch(input.cwd);
          yield* Effect.addFinalizer(() => releaseWatch(root));
          const subscription = yield* PubSub.subscribe(entry.changes);
          const startSeq = (yield* Ref.get(entry.state)).seq;
          const snapshot = yield* readBoardAt(root);
          return Stream.make(snapshot).pipe(
            Stream.concat(
              Stream.fromSubscription(subscription).pipe(
                Stream.filter((update) => update.seq > startSeq),
                Stream.map((update) => update.snapshot),
              ),
            ),
          );
        }),
      ),
  });
});

export const layer = Layer.effect(TodoBoard, make);
