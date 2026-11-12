import { OrchestratorMcpFailure, type ProjectId, type TodoBoardError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as TodoBoard from "../../../board/TodoBoard.ts";
import * as Project from "../../../project/ProjectService.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { readCaller, resolveProjectId, unavailable } from "../../threadAccess.ts";
import { boardOverview } from "./overview.ts";
import { TodoToolkit } from "./tools.ts";

const boardFailure = (error: TodoBoardError) =>
  error.failure === "operation_failed"
    ? unavailable()
    : new OrchestratorMcpFailure({ code: "invalid_request", message: error.message });

const boardCwd = Effect.fn("TodoMcp.boardCwd")(function* (requested: ProjectId | undefined) {
  const context = yield* readCaller();
  const projectId = yield* resolveProjectId(context, requested);
  const projects = yield* Project.ProjectService;
  const project = yield* projects.getById(projectId).pipe(Effect.mapError(unavailable));
  if (Option.isNone(project))
    return yield* new OrchestratorMcpFailure({
      code: "invalid_request",
      message: "The project was not found.",
    });
  return project.value.workspaceRoot;
});

export const layer = McpToolAccess.toLayer(TodoToolkit, {
  t3_todo_read: McpToolAccess.reads(({ projectId }) =>
    Effect.gen(function* () {
      const cwd = yield* boardCwd(projectId);
      const board = yield* TodoBoard.TodoBoard;
      return boardOverview(yield* board.read({ cwd }).pipe(Effect.mapError(boardFailure)));
    }),
  ),
  t3_todo_set_sequence: McpToolAccess.writesEnvironment(({ projectId, ids, epic }) =>
    Effect.gen(function* () {
      const cwd = yield* boardCwd(projectId);
      const board = yield* TodoBoard.TodoBoard;
      return yield* board.setSequence({ cwd, ids, epic }).pipe(Effect.mapError(boardFailure));
    }),
  ),
});
