import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type Project as ProjectRecord,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import * as TodoBoard from "../../../board/TodoBoard.ts";
import { installBoard } from "../../../board/fixtures.ts";
import * as ThreadManagement from "../../../orchestration-v2/ThreadManagementService.ts";
import * as Project from "../../../project/ProjectService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { liveThreadShell } from "../../McpToolAccess.testkit.ts";
import * as TodoHandlers from "./handlers.ts";
import { TodoToolkit } from "./tools.ts";

const threadId = ThreadId.make("thread:todo");
const projectId = ProjectId.make("project:mcp-test");
const decodeOverview = Schema.decodeUnknownSync(TodoToolkit.tools.t3_todo_read.successSchema);

const harness = (input: {
  readonly workspaceRoot: string;
  readonly capabilities?: ReadonlySet<McpInvocationContext.McpCapability>;
  readonly readOnlyClient?: true;
}) =>
  McpToolAccess.HandlersLayer.layer(TodoHandlers.layer).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        TodoBoard.layer,
        Layer.succeed(McpInvocationContext.McpInvocationContext, {
          environmentId: EnvironmentId.make("environment:todo"),
          requestNamespace: "provider:todo",
          thread: input.readOnlyClient
            ? undefined
            : {
                threadId,
                providerSessionId: "provider:todo",
                providerInstanceId: ProviderInstanceId.make("codex"),
              },
          client: input.readOnlyClient
            ? { sessionId: "session:todo", label: "Client", access: "read-only" }
            : undefined,
          capabilities: input.capabilities ?? new Set(["orchestration" as const]),
          issuedAt: 0,
        }),
        Layer.mock(ThreadManagement.ThreadManagementService)({
          getThreadShell: (id) => Effect.succeed(liveThreadShell(id)),
        }),
        Layer.mock(Project.ProjectService)({
          getById: (id) =>
            Effect.succeedSome({
              id,
              workspaceRoot: input.workspaceRoot,
            } as unknown as ProjectRecord),
        }),
      ).pipe(Layer.provideMerge(NodeServices.layer)),
    ),
  );

const installProjectBoard = Effect.gen(function* () {
  const path = yield* Path.Path;
  const { boardDir } = yield* installBoard("board-before");
  return { boardDir, workspaceRoot: path.dirname(boardDir) };
});

const lastResult = Effect.map(
  (results: ReadonlyArray<{ readonly result: unknown }>) => results.at(-1)?.result,
);

const callTools = Effect.gen(function* () {
  const toolkit = yield* TodoToolkit;
  return {
    read: (input: { readonly projectId?: ProjectId }) =>
      toolkit.handle("t3_todo_read", input).pipe(Stream.unwrap, Stream.runCollect, lastResult),
    setSequence: (input: { readonly projectId?: ProjectId; readonly ids: ReadonlyArray<string> }) =>
      toolkit
        .handle("t3_todo_set_sequence", input)
        .pipe(Stream.unwrap, Stream.runCollect, lastResult),
  };
});

it.layer(NodeServices.layer)("todo MCP tools", (it) => {
  it.effect(
    "reads the open tickets with tags, parent and link ids and the file-order sequence",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { boardDir, workspaceRoot } = yield* installProjectBoard;
        yield* fs.writeFileString(path.join(boardDir, "SEQUENCE.md"), "762b5\r\n55041\n");

        const overview = decodeOverview(
          yield* callTools.pipe(
            Effect.flatMap((tools) => tools.read({})),
            Effect.provide(harness({ workspaceRoot })),
          ),
        );

        const ticket = (id: string) => overview.open.find((candidate) => candidate.id === id);
        expect(overview.sequence).toEqual(["762b5-comment-target", "55041-tag-target"]);
        expect(overview.open).toHaveLength(14);
        expect(ticket("e0ae5-archive-target")).toBeUndefined();
        expect(ticket("4b42b-epic-carrier")).toMatchObject({
          status: "backlog",
          tags: ["Epic", "Foundation"],
        });
        expect(ticket("6ba55-parser-fidelity")).toMatchObject({
          parentId: "0f853-board-foundation",
        });
        expect(ticket("4fbef-link-remove-target")).toMatchObject({
          blocks: ["4110c-link-remove-destination"],
        });
        expect(ticket("4110c-link-remove-destination")).toMatchObject({
          blockedBy: ["4fbef-link-remove-target"],
        });
        expect(Object.keys(ticket("762b5-comment-target") ?? {})).toEqual([
          "id",
          "title",
          "status",
        ]);
      }),
  );

  it.effect("replaces the order, drops closed tickets and rejects unknown ids", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { boardDir, workspaceRoot } = yield* installProjectBoard;

      const outcome = yield* Effect.gen(function* () {
        const tools = yield* callTools;
        const saved = yield* tools.setSequence({ ids: ["55041", "e0ae5", "762b5", "55041"] });
        const afterSave = yield* tools.read({});
        const unknown = yield* tools.setSequence({ ids: ["762b5", "zzzzz"] });
        const ambiguous = yield* tools.setSequence({ ids: ["e"] });
        return { saved, afterSave, unknown, ambiguous };
      }).pipe(Effect.provide(harness({ workspaceRoot })));

      expect(outcome.saved).toEqual({ sequence: ["55041-tag-target", "762b5-comment-target"] });
      expect(outcome.afterSave).toMatchObject({
        sequence: ["55041-tag-target", "762b5-comment-target"],
      });
      expect(outcome.unknown).toMatchObject({
        code: "invalid_request",
        message: expect.stringContaining("zzzzz"),
      });
      expect(outcome.ambiguous).toMatchObject({
        code: "invalid_request",
        message: expect.stringContaining("Ambiguous"),
      });
      expect(yield* fs.readFileString(path.join(boardDir, "SEQUENCE.md"))).toBe("55041\n762b5\n");
    }),
  );

  it.effect("refuses a credential without orchestration and a write from a read-only client", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { boardDir, workspaceRoot } = yield* installProjectBoard;

      const withoutCapability = yield* Effect.gen(function* () {
        const tools = yield* callTools;
        return {
          read: yield* tools.read({}),
          write: yield* tools.setSequence({ ids: ["762b5"] }),
        };
      }).pipe(Effect.provide(harness({ workspaceRoot, capabilities: new Set() })));
      const readOnlyClient = yield* Effect.gen(function* () {
        const tools = yield* callTools;
        return {
          read: yield* tools.read({ projectId }),
          write: yield* tools.setSequence({ projectId, ids: ["762b5"] }),
        };
      }).pipe(Effect.provide(harness({ workspaceRoot, readOnlyClient: true })));

      expect(withoutCapability.read).toMatchObject({ code: "capability_denied" });
      expect(withoutCapability.write).toMatchObject({ code: "capability_denied" });
      expect(readOnlyClient.read).toMatchObject({ sequence: [] });
      expect(readOnlyClient.write).toMatchObject({ code: "capability_denied" });
      expect(yield* fs.exists(path.join(boardDir, "SEQUENCE.md"))).toBe(false);
    }),
  );
});
