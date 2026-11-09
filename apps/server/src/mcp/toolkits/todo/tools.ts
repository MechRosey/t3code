import {
  OrchestratorMcpFailure,
  ProjectId,
  TodoBoardSequenceInput,
  TodoBoardSequenceResult,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../../../project/ProjectService.ts";
import * as TodoBoard from "../../../board/TodoBoard.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
  ProjectService.ProjectService,
  TodoBoard.TodoBoard,
];

const projectId = Schema.optional(
  ProjectId.annotate({ description: "Project. Default: this thread's project." }),
);

const TodoTicket = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  status: Schema.String,
  tags: Schema.optionalKey(Schema.Array(Schema.String)),
  parentId: Schema.optionalKey(Schema.String),
  epic: Schema.optionalKey(Schema.String),
  blocks: Schema.optionalKey(Schema.Array(Schema.String)),
  blockedBy: Schema.optionalKey(Schema.Array(Schema.String)),
});

export const TodoBoardOverview = Schema.Struct({
  root: Schema.String,
  sequence: Schema.Array(Schema.String),
  open: Schema.Array(TodoTicket),
});

const TodoReadTool = Tool.make("t3_todo_read", {
  description:
    "Read a project's todo board: the planned `sequence` of ticket ids, and each open ticket with status, tags, parent, epic, `blocks` and `blockedBy`.",
  parameters: Schema.Struct({ projectId }),
  success: TodoBoardOverview,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);

const TodoSetSequenceTool = Tool.make("t3_todo_set_sequence", {
  description:
    "Replace a project's whole planned ticket order with `ids` (todo ticket ids, short or full). Closed tickets are dropped; unknown ids fail. Returns the saved `sequence`.",
  parameters: Schema.Struct({ projectId, ids: TodoBoardSequenceInput.fields.ids }),
  success: TodoBoardSequenceResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true);

export const TodoToolkit = Toolkit.make(TodoReadTool, TodoSetSequenceTool);
