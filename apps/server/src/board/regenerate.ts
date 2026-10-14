import * as Effect from "effect/Effect";

import { TodoBoardError } from "@t3tools/contracts";

import * as ProcessRunner from "../processRunner.ts";

export type TodoBoardRegenerateTarget = "board" | "index";

const REGENERATION_TIMEOUT = "60 seconds";

const STDERR_MESSAGE_LIMIT = 2000;

const REGENERATION_ARTIFACTS: Record<TodoBoardRegenerateTarget, ReadonlyArray<string>> = {
  board: ["board.html", "board-map.html"],
  index: ["INDEX.md", "board.html", "board-map.html"],
};

const toError = (message: string, cause?: unknown): TodoBoardError =>
  new TodoBoardError({
    failure: "operation_failed",
    message,
    ...(cause !== undefined ? { cause } : {}),
  });

export const regenerationArtifacts = (target: TodoBoardRegenerateTarget): ReadonlyArray<string> => [
  ...REGENERATION_ARTIFACTS[target],
];

export const todoSkillScriptPath = (home: string): string =>
  `${home.replace(/[\\/]+$/, "")}/.claude/skills/todo/scripts/Todo.ps1`;

export const regenerationSpawnArgs = (
  target: TodoBoardRegenerateTarget,
  scriptPath: string,
  root: string,
): ReadonlyArray<string> => [
  "-NoLogo",
  "-NoProfile",
  "-NonInteractive",
  "-File",
  scriptPath,
  target,
  "-Root",
  root,
];

export const regenerationSpawnFailure = (
  scriptPath: string,
  exitCode: number | null,
  stderr: string,
): TodoBoardError => {
  const summary =
    exitCode === null
      ? `Todo board regeneration did not report an exit code: ${scriptPath}`
      : `Todo board regeneration failed with exit code ${exitCode}: ${scriptPath}`;
  const detail = stderr.trim();
  const trimmed =
    detail.length > STDERR_MESSAGE_LIMIT ? `${detail.slice(0, STDERR_MESSAGE_LIMIT)}...` : detail;
  return toError(trimmed.length > 0 ? `${summary} ${trimmed}` : summary);
};

export const runTodoSkillRegeneration = Effect.fn("TodoBoard.runTodoSkillRegeneration")(function* (
  runner: ProcessRunner.ProcessRunner["Service"],
  target: TodoBoardRegenerateTarget,
  root: string,
  options: { readonly scriptPath: string },
): Effect.fn.Return<void, TodoBoardError> {
  const result = yield* runner
    .run({
      command: "powershell.exe",
      args: regenerationSpawnArgs(target, options.scriptPath, root),
      cwd: root,
      timeout: REGENERATION_TIMEOUT,
    })
    .pipe(
      Effect.mapError((cause) =>
        toError(`Failed to run the todo skill script: ${cause.message}`, cause),
      ),
    );
  const exitCode = result.code === null ? null : Number(result.code);
  if (exitCode !== 0) {
    return yield* regenerationSpawnFailure(options.scriptPath, exitCode, result.stderr);
  }
});
