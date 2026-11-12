import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  type OrchestrationV2LinkOrigin,
  ProjectId,
  ProviderInstanceId,
  type RuntimeMode,
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
  readonly runtimeMode?: RuntimeMode;
  readonly linkOrigin?: OrchestrationV2LinkOrigin;
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
          getThreadShell: (id) =>
            Effect.succeed({
              ...liveThreadShell(
                id,
                input.runtimeMode === undefined ? {} : { runtimeMode: input.runtimeMode },
              ),
              ...(input.linkOrigin === undefined ? {} : { linkOrigin: input.linkOrigin }),
            }),
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
    setSequence: (input: {
      readonly projectId?: ProjectId;
      readonly ids: ReadonlyArray<string>;
      readonly epic?: string;
    }) =>
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
        yield* fs.writeFileString(
          path.join(boardDir, "4b42b-epic-carrier", "SEQUENCE.md"),
          "890fa\n6ba55\n",
        );

        const overview = decodeOverview(
          yield* callTools.pipe(
            Effect.flatMap((tools) => tools.read({})),
            Effect.provide(harness({ workspaceRoot })),
          ),
        );

        const ticket = (id: string) => overview.open.find((candidate) => candidate.id === id);
        expect(overview.sequence).toEqual(["762b5-comment-target", "55041-tag-target"]);
        expect(overview.epicSequences).toEqual({
          Foundation: ["890fa-link-destination", "6ba55-parser-fidelity"],
        });
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
        const epicSaved = yield* tools.setSequence({ epic: "Foundation", ids: ["890fa", "e0ae5"] });
        const afterEpicSave = yield* tools.read({});
        const missingEpic = yield* tools.setSequence({ epic: "Missing", ids: ["762b5"] });
        return { saved, afterSave, unknown, ambiguous, epicSaved, afterEpicSave, missingEpic };
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
      expect(outcome.epicSaved).toEqual({ sequence: ["890fa-link-destination"] });
      expect(outcome.afterEpicSave).toMatchObject({
        sequence: ["55041-tag-target", "762b5-comment-target"],
        epicSequences: { Foundation: ["890fa-link-destination"] },
      });
      expect(outcome.missingEpic).toMatchObject({
        code: "invalid_request",
        message: expect.stringContaining("Missing"),
      });
      expect(yield* fs.readFileString(path.join(boardDir, "SEQUENCE.md"))).toBe("55041\n762b5\n");
      expect(
        yield* fs.readFileString(path.join(boardDir, "4b42b-epic-carrier", "SEQUENCE.md")),
      ).toBe("890fa\n");
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

  it.effect(
    "refuses a caller below full access and a fenced link, and lets a full-access link in",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { boardDir, workspaceRoot } = yield* installProjectBoard;
        const writeAs = (options: Omit<Parameters<typeof harness>[0], "workspaceRoot">) =>
          Effect.flatMap(callTools, (tools) => tools.setSequence({ ids: ["762b5"] })).pipe(
            Effect.provide(harness({ workspaceRoot, ...options })),
          );

        const belowFullAccess = yield* writeAs({ runtimeMode: "approval-required" });
        const fencedLink = yield* writeAs({
          linkOrigin: { sessionId: "session:link", label: "Peer", access: "approval-required" },
        });
        const sequencePath = path.join(boardDir, "SEQUENCE.md");
        const refusedWrites = yield* fs.exists(sequencePath);
        const fullAccessLink = yield* writeAs({
          linkOrigin: { sessionId: "session:link", label: "Peer", access: "full-access" },
        });

        expect(belowFullAccess).toMatchObject({
          code: "capability_denied",
          message: expect.stringContaining("full-access"),
        });
        expect(fencedLink).toMatchObject({
          code: "capability_denied",
          message: expect.stringContaining("projects or environment settings"),
        });
        expect(refusedWrites).toBe(false);
        expect(fullAccessLink).toEqual({ sequence: ["762b5-comment-target"] });
      }),
  );
});
