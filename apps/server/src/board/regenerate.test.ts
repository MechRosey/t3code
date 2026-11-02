import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { TodoBoardError } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import * as ProcessRunner from "../processRunner.ts";
import { fixturesRoot } from "./fixtures.ts";
import * as TodoBoard from "./TodoBoard.ts";
import {
  regenerationArtifacts,
  regenerationSpawnArgs,
  regenerationSpawnFailure,
  runTodoSkillRegeneration,
  todoSkillScriptPath,
} from "./regenerate.ts";

describe("regenerationArtifacts", () => {
  it("maps the board target to the two board pages", () => {
    expect(regenerationArtifacts("board")).toEqual(["board.html", "board-map.html"]);
  });

  it("maps the index target to INDEX.md plus the board pages", () => {
    expect(regenerationArtifacts("index")).toEqual(["INDEX.md", "board.html", "board-map.html"]);
  });
});

describe("todoSkillScriptPath", () => {
  it("derives the skill script from the caller-supplied home directory", () => {
    const scriptPath = todoSkillScriptPath("C:\\Users\\someone-else");
    expect(scriptPath.replace(/\\/g, "/")).toBe(
      "C:/Users/someone-else/.claude/skills/todo/scripts/Todo.ps1",
    );
  });
});

describe("regenerationSpawnArgs", () => {
  it("passes -File with plain positional and named arguments only", () => {
    const args = regenerationSpawnArgs(
      "board",
      "C:\\Users\\someone-else\\.claude\\skills\\todo\\scripts\\Todo.ps1",
      "C:\\board\\.todo",
    );
    expect(args).toEqual([
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-File",
      "C:\\Users\\someone-else\\.claude\\skills\\todo\\scripts\\Todo.ps1",
      "board",
      "-Root",
      "C:\\board\\.todo",
    ]);
  });

  it("uses the index command for the index target", () => {
    const args = regenerationSpawnArgs("index", "C:\\script.ps1", "C:\\board\\.todo");
    expect(args[5]).toBe("index");
  });

  it("never carries an encoded or inline command", () => {
    const args = regenerationSpawnArgs("board", "C:\\script.ps1", "C:\\board\\.todo");
    expect(args.some((arg) => arg === "-Command" || arg === "-EncodedCommand")).toBe(false);
  });
});

describe("regenerationSpawnFailure", () => {
  it("maps a non-zero exit to operation_failed carrying the captured stderr", () => {
    const error = regenerationSpawnFailure("C:\\script.ps1", 1, "Board rebuild failed: boom\n");
    expect(error.failure).toBe("operation_failed");
    expect(error.message).toContain("exit code 1");
    expect(error.message).toContain("Board rebuild failed: boom");
  });

  it("keeps a non-empty message when stderr is empty", () => {
    const error = regenerationSpawnFailure("C:\\script.ps1", 2, "   \n");
    expect(error.message.trim().length).toBeGreaterThan(0);
    expect(error.message).toContain("exit code 2");
  });

  it("maps a missing exit code to a non-empty message", () => {
    const error = regenerationSpawnFailure("C:\\script.ps1", null, "");
    expect(error.failure).toBe("operation_failed");
    expect(error.message.trim().length).toBeGreaterThan(0);
  });
});

const fakeOutput = (overrides: Partial<ProcessRunner.ProcessRunOutput> = {}) =>
  ({
    stdout: "",
    stderr: "",
    code: ChildProcessSpawner.ExitCode(0),
    timedOut: false,
    stdoutTruncated: false,
    stderrTruncated: false,
    stdoutInvalidUtf8: false,
    stderrInvalidUtf8: false,
    ...overrides,
  }) as ProcessRunner.ProcessRunOutput;

const runnerWith = (run: ProcessRunner.ProcessRunner["Service"]["run"]) =>
  ProcessRunner.ProcessRunner.of({ run });

const spawnCalls: Array<ProcessRunner.ProcessRunInput> = [];

const capturingRunner = (exitCode: number, stderr: string) =>
  runnerWith((input) => {
    spawnCalls.push(input);
    return Effect.succeed(fakeOutput({ code: ChildProcessSpawner.ExitCode(exitCode), stderr }));
  });

const runRegeneration = (runner: ProcessRunner.ProcessRunner["Service"]) =>
  Effect.exit(
    runTodoSkillRegeneration(runner, "board", "C:\\board\\.todo", {
      scriptPath: "C:\\home\\.claude\\skills\\todo\\scripts\\Todo.ps1",
    }),
  );

const squashedFailure = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? (Cause.squash(exit.cause) as TodoBoardError) : null;

describe("runTodoSkillRegeneration", () => {
  it.effect("spawns powershell -File with the board command against the resolved root", () =>
    Effect.gen(function* () {
      spawnCalls.length = 0;
      const exit = yield* runRegeneration(capturingRunner(0, ""));
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]?.command).toBe("powershell.exe");
      expect(spawnCalls[0]?.args?.[3]).toBe("-File");
      expect(spawnCalls[0]?.args?.[4]).toBe("C:\\home\\.claude\\skills\\todo\\scripts\\Todo.ps1");
      expect(spawnCalls[0]?.args?.[5]).toBe("board");
      expect(spawnCalls[0]?.args?.[6]).toBe("-Root");
      expect(spawnCalls[0]?.args?.[7]).toBe("C:\\board\\.todo");
      expect(spawnCalls[0]?.cwd).toBe("C:\\board\\.todo");
    }),
  );

  it.effect("succeeds without spawning a shell wrapper", () =>
    Effect.gen(function* () {
      spawnCalls.length = 0;
      const exit = yield* runRegeneration(capturingRunner(0, ""));
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(spawnCalls[0]?.args?.includes("-EncodedCommand")).toBe(false);
      expect(spawnCalls[0]?.args?.includes("-Command")).toBe(false);
    }),
  );

  it.effect("fails with operation_failed and the captured stderr on a non-zero exit", () =>
    Effect.gen(function* () {
      const exit = yield* runRegeneration(capturingRunner(1, "Index rebuild failed: locked"));
      const error = squashedFailure(exit);
      expect(error).not.toBeNull();
      expect(error?.failure).toBe("operation_failed");
      expect(error?.message).toContain("Index rebuild failed: locked");
    }),
  );

  it.effect("maps a spawn failure to operation_failed", () =>
    Effect.gen(function* () {
      const exit = yield* runRegeneration(
        runnerWith(() =>
          Effect.fail(
            new ProcessRunner.ProcessSpawnError({
              command: "powershell.exe",
              argumentCount: 8,
              cause: new Error("denied"),
            }),
          ),
        ),
      );
      const error = squashedFailure(exit);
      expect(error).not.toBeNull();
      expect(error?.failure).toBe("operation_failed");
      expect(error?.message).toContain("Failed to run the todo skill script");
    }),
  );

  it.effect("maps a spawn timeout to operation_failed", () =>
    Effect.gen(function* () {
      const exit = yield* runRegeneration(
        runnerWith(() =>
          Effect.fail(
            new ProcessRunner.ProcessTimeoutError({
              command: "powershell.exe",
              argumentCount: 8,
              timeoutMs: 60000,
            }),
          ),
        ),
      );
      const error = squashedFailure(exit);
      expect(error).not.toBeNull();
      expect(error?.failure).toBe("operation_failed");
      expect(error?.message).toContain("timed out");
    }),
  );
});

const realSkillInstalled = Effect.gen(function* () {
  if (HostProcess.Platform.defaultValue() !== "win32") return false;
  const fs = yield* FileSystem.FileSystem;
  const info = yield* Effect.option(
    fs.stat(todoSkillScriptPath(HostProcess.HomeDirectory.defaultValue())),
  );
  return Option.isSome(info) && info.value.type === "File";
}).pipe(Effect.provide(NodeServices.layer));

const SKIP_REASON = "Needs Windows with the todo skill installed.";

const installFixtureBoard = (fixtureBoard: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-board-regen-" });
    const boardDir = path.join(target, "project", ".todo");
    yield* fs.copy(path.join(fixturesRoot, fixtureBoard), boardDir);
    const cwd = path.join(target, "project");
    return { boardDir, cwd };
  });

describe("TodoBoard.regenerate with the real skill script", () => {
  it.live("regenerates board.html and board-map.html into the board root", (ctx) =>
    Effect.gen(function* () {
      if (!(yield* realSkillInstalled)) return ctx.skip(SKIP_REASON);
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { boardDir, cwd } = yield* installFixtureBoard("board-before");
      const board = yield* TodoBoard.TodoBoard;
      const { artifacts } = yield* board.regenerate({ cwd, target: "board" });
      expect(artifacts).toEqual(["board.html", "board-map.html"]);
      const html = yield* fs.stat(path.join(boardDir, "board.html"));
      const map = yield* fs.stat(path.join(boardDir, "board-map.html"));
      expect(html.type).toBe("File");
      expect(map.type).toBe("File");
    }).pipe(Effect.provide(TodoBoard.layer.pipe(Layer.provideMerge(NodeServices.layer)))),
  );

  it.live("rebuilds INDEX.md and refreshes the board pages for the index target", (ctx) =>
    Effect.gen(function* () {
      if (!(yield* realSkillInstalled)) return ctx.skip(SKIP_REASON);
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { boardDir, cwd } = yield* installFixtureBoard("board-before");
      const board = yield* TodoBoard.TodoBoard;
      const { artifacts } = yield* board.regenerate({ cwd, target: "index" });
      expect(artifacts).toEqual(["INDEX.md", "board.html", "board-map.html"]);
      const index = yield* fs.stat(path.join(boardDir, "INDEX.md"));
      const html = yield* fs.stat(path.join(boardDir, "board.html"));
      expect(index.type).toBe("File");
      expect(html.type).toBe("File");
      const indexText = yield* fs.readFileString(path.join(boardDir, "INDEX.md"));
      expect(indexText).toContain("e20d1-status-target");
    }).pipe(Effect.provide(TodoBoard.layer.pipe(Layer.provideMerge(NodeServices.layer)))),
  );

  it.live("fails with operation_failed when the skill script is absent", (ctx) =>
    Effect.gen(function* () {
      if (!(yield* realSkillInstalled)) return ctx.skip(SKIP_REASON);
      const { cwd } = yield* installFixtureBoard("board-before");
      const board = yield* TodoBoard.TodoBoard;
      const failure = yield* Effect.flip(board.regenerate({ cwd, target: "board" }));
      expect(failure._tag).toBe("TodoBoardError");
      if (failure._tag === "TodoBoardError") {
        expect(failure.failure).toBe("operation_failed");
        expect(failure.message).toContain("Todo skill script not found");
      }
    }).pipe(
      Effect.provide(
        TodoBoard.layer.pipe(
          Layer.provideMerge(NodeServices.layer),
          Layer.merge(Layer.succeed(HostProcess.HomeDirectory, "C:\\no-skill-home")),
        ),
      ),
    ),
  );
});
