import * as Schema from "effect/Schema";

import { NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const TODO_BOARD_STATUSES = [
  "backlog",
  "doing",
  "read",
  "blocked",
  "done",
  "cancelled",
] as const;

export const TodoBoardStatus = Schema.Literals(TODO_BOARD_STATUSES);
export type TodoBoardStatus = typeof TodoBoardStatus.Type;

export const TodoBoardLinkType = Schema.Literals(["blocks", "relates"]);
export type TodoBoardLinkType = typeof TodoBoardLinkType.Type;

export const TodoIssueSections = Schema.Struct({
  brief: Schema.Struct({ content: Schema.Boolean, text: Schema.String }),
  reading: Schema.Struct({ content: Schema.Boolean, marker: Schema.Boolean }),
  doing: Schema.Struct({ content: Schema.Boolean, marker: Schema.Boolean }),
  log: Schema.Struct({ content: Schema.Boolean }),
  openQuestions: Schema.Struct({
    content: Schema.Boolean,
    hasOpen: Schema.Boolean,
    hasHumanOpen: Schema.Boolean,
  }),
});
export type TodoIssueSections = typeof TodoIssueSections.Type;

export const TodoIssueLinks = Schema.Struct({
  blocks: Schema.Array(Schema.String),
  relates: Schema.Array(Schema.String),
});
export type TodoIssueLinks = typeof TodoIssueLinks.Type;

export const TodoIssue = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  status: TodoBoardStatus,
  created: Schema.String,
  updated: Schema.String,
  tags: Schema.Array(Schema.String),
  epic: Schema.NullOr(Schema.String),
  parentId: Schema.NullOr(Schema.String),
  depth: NonNegativeInt,
  rootHue: Schema.NullOr(Schema.Int),
  markerPath: Schema.String,
  archived: Schema.Boolean,
  sections: TodoIssueSections,
  body: Schema.String,
  links: TodoIssueLinks,
});
export type TodoIssue = typeof TodoIssue.Type;

export const TodoBoardSnapshot = Schema.Struct({
  root: Schema.String,
  repoName: Schema.String,
  issues: Schema.Array(TodoIssue),
});
export type TodoBoardSnapshot = typeof TodoBoardSnapshot.Type;

export const TodoBoardReadInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
});
export type TodoBoardReadInput = typeof TodoBoardReadInput.Type;

export const TodoBoardReadResult = TodoBoardSnapshot;
export type TodoBoardReadResult = typeof TodoBoardReadResult.Type;

export const TodoBoardStatusAction = Schema.Struct({
  action: Schema.Literal("status"),
  cwd: TrimmedNonEmptyString,
  id: TrimmedNonEmptyString,
  status: TrimmedNonEmptyString,
  force: Schema.optional(Schema.Boolean),
});
export type TodoBoardStatusAction = typeof TodoBoardStatusAction.Type;

export const TodoBoardCommentAction = Schema.Struct({
  action: Schema.Literal("comment"),
  cwd: TrimmedNonEmptyString,
  id: TrimmedNonEmptyString,
  text: TrimmedNonEmptyString,
  by: Schema.optional(TrimmedNonEmptyString),
});
export type TodoBoardCommentAction = typeof TodoBoardCommentAction.Type;

export const TodoBoardTagAction = Schema.Struct({
  action: Schema.Literal("tag"),
  cwd: TrimmedNonEmptyString,
  id: TrimmedNonEmptyString,
  tag: TrimmedNonEmptyString,
  remove: Schema.optional(Schema.Boolean),
});
export type TodoBoardTagAction = typeof TodoBoardTagAction.Type;

export const TodoBoardLinkAction = Schema.Struct({
  action: Schema.Literal("link"),
  cwd: TrimmedNonEmptyString,
  id: TrimmedNonEmptyString,
  type: TodoBoardLinkType,
  target: TrimmedNonEmptyString,
  remove: Schema.optional(Schema.Boolean),
});
export type TodoBoardLinkAction = typeof TodoBoardLinkAction.Type;

export const TodoBoardRollupAction = Schema.Struct({
  action: Schema.Literal("rollup"),
  cwd: TrimmedNonEmptyString,
  id: TrimmedNonEmptyString,
  status: TrimmedNonEmptyString,
  text: TrimmedNonEmptyString,
});
export type TodoBoardRollupAction = typeof TodoBoardRollupAction.Type;

export const TodoBoardArchiveAction = Schema.Struct({
  action: Schema.Literal("archive"),
  cwd: TrimmedNonEmptyString,
  id: TrimmedNonEmptyString,
});
export type TodoBoardArchiveAction = typeof TodoBoardArchiveAction.Type;

export const TodoBoardMutateInput = Schema.Union([
  TodoBoardStatusAction,
  TodoBoardCommentAction,
  TodoBoardTagAction,
  TodoBoardLinkAction,
  TodoBoardRollupAction,
  TodoBoardArchiveAction,
]);
export type TodoBoardMutateInput = typeof TodoBoardMutateInput.Type;

export const TodoBoardMutateResult = Schema.Struct({
  issue: TodoIssue,
});
export type TodoBoardMutateResult = typeof TodoBoardMutateResult.Type;

export const TodoBoardSubscribeInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
});
export type TodoBoardSubscribeInput = typeof TodoBoardSubscribeInput.Type;

export const TodoBoardFailure = Schema.Literals([
  "board_not_found",
  "pointer_dangling",
  "cwd_not_directory",
  "issue_not_found",
  "ambiguous_issue_id",
  "invalid_status",
  "invalid_link_type",
  "open_children",
  "subtree_open",
  "no_parent",
  "conflict",
  "operation_failed",
]);
export type TodoBoardFailure = typeof TodoBoardFailure.Type;

export class TodoBoardError extends Schema.TaggedError<TodoBoardError>()("TodoBoardError", {
  failure: TodoBoardFailure,
  message: TrimmedNonEmptyString,
  id: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Defect()),
}) {}
