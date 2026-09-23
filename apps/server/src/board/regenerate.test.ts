import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";

import { TodoBoardError } from "@t3tools/contracts";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import * as ProcessRunner from "../processRunner.ts";
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
    expect(args[4]).toBe("index");
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
  Layer.succeed(ProcessRunner.ProcessRunner, ProcessRunner.ProcessRunner.of({ run }));

const spawnCalls: Array<ProcessRunner.ProcessRunInput> = [];

const capturingRunner = (exitCode: number, stderr: string) =>
  runnerWith((input) => {
    spawnCalls.push(input);
    return Effect.succeed(fakeOutput({ code: ChildProcessSpawner.ExitCode(exitCode), stderr }));
  });

const runRegeneration = (layer: Layer.Layer<ProcessRunner.ProcessRunner>) =>
  Effect.runPromiseExit(
    runTodoSkillRegeneration("board", "C:\\board\\.todo", {
      scriptPath: "C:\\home\\.claude\\skills\\todo\\scripts\\Todo.ps1",
    }).pipe(Effect.provide(layer)),
  );

describe("runTodoSkillRegeneration", () => {
  it("spawns powershell -File with the board command against the resolved root", async () => {
    spawnCalls.length = 0;
    const exit = await runRegeneration(capturingRunner(0, ""));
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.command).toBe("powershell.exe");
    expect(spawnCalls[0]?.args?.[3]).toBe("-File");
    expect(spawnCalls[0]?.args?.[4]).toBe("C:\\home\\.claude\\skills\\todo\\scripts\\Todo.ps1");
    expect(spawnCalls[0]?.args?.[5]).toBe("board");
    expect(spawnCalls[0]?.args?.[6]).toBe("-Root");
    expect(spawnCalls[0]?.args?.[7]).toBe("C:\\board\\.todo");
    expect(spawnCalls[0]?.cwd).toBe("C:\\board\\.todo");
  });

  it("succeeds without spawning a shell wrapper", async () => {
    spawnCalls.length = 0;
    const exit = await runRegeneration(capturingRunner(0, ""));
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(spawnCalls[0]?.args?.includes("-EncodedCommand")).toBe(false);
    expect(spawnCalls[0]?.args?.includes("-Command")).toBe(false);
  });

  it("fails with operation_failed and the captured stderr on a non-zero exit", async () => {
    const exit = await runRegeneration(capturingRunner(1, "Index rebuild failed: locked"));
    const error = Exit.isFailure(exit) ? (exit.cause.error as TodoBoardError) : null;
    expect(error).not.toBeNull();
    expect(error?.failure).toBe("operation_failed");
    expect(error?.message).toContain("Index rebuild failed: locked");
  });

  it("maps a spawn failure to operation_failed", async () => {
    const exit = await runRegeneration(
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
    const error = Exit.isFailure(exit) ? (exit.cause.error as TodoBoardError) : null;
    expect(error).not.toBeNull();
    expect(error?.failure).toBe("operation_failed");
    expect(error?.message).toContain("Failed to run the todo skill script");
  });

  it("maps a spawn timeout to operation_failed", async () => {
    const exit = await runRegeneration(
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
    const error = Exit.isFailure(exit) ? (exit.cause.error as TodoBoardError) : null;
    expect(error).not.toBeNull();
    expect(error?.failure).toBe("operation_failed");
    expect(error?.message).toContain("timed out");
  });
});
