import * as Effect from "effect/Effect";

import * as McpToolAccess from "../../McpToolAccess.ts";
import { TodoToolkit } from "./tools.ts";

export const layer = McpToolAccess.toLayer(TodoToolkit, {
  t3_todo_read: McpToolAccess.reads(() => Effect.die("t3_todo_read is not implemented")),
  t3_todo_set_sequence: McpToolAccess.writes(() =>
    Effect.die("t3_todo_set_sequence is not implemented"),
  ),
});
