import { describe, expect, it } from "@effect/vitest";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { parseIssue, serializeIssue } from "./frontmatter.ts";
import {
  applyComment,
  applyLink,
  applyRollup,
  applyStatus,
  applyTag,
  assertStatusChildrenGuard,
  BoardRuleError,
} from "./mutations.ts";
import { findMarkerPath, readFixture } from "./fixtures.ts";

const issueIds = [
  "0f853-board-foundation",
  "6ba55-parser-fidelity",
  "d897a-byte-round-trip",
  "e20d1-status-target",
  "762b5-comment-target",
  "55041-tag-target",
  "64eb7-tag-remove-target",
  "67e0c-link-target",
  "890fa-link-destination",
  "4fbef-link-remove-target",
  "4110c-link-remove-destination",
  "e594b-rollup-child",
  "0fef4-rollup-grandchild",
  "e0ae5-archive-target",
  "df3cf-archive-child",
  "4b42b-epic-carrier",
] as const;

const knownIds = issueIds as readonly string[];

const NOW = "2026-09-20 12:00";

it.layer(NodeServices.layer)((it) => {
  const loadBefore = (id: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const markerPath = yield* findMarkerPath("board-before", id);
      const text = yield* fs.readFileString(markerPath);
      return parseIssue(text, id);
    });

  const goldenAfter = (verb: string, id: string) => readFixture(`after-${verb}/${id}/${id}.md`);

  const expectBytes = (actual: Buffer, expected: Buffer) => {
    expect(Buffer.compare(actual, expected)).toBe(0);
  };

  describe("status mutation equivalence", () => {
    it.effect("matches the skill's status byte output", () =>
      Effect.gen(function* () {
        const parsed = yield* loadBefore("e20d1-status-target");
        const next = applyStatus(parsed, { status: "doing" }, NOW);
        expectBytes(
          Buffer.from(serializeIssue(next)),
          yield* goldenAfter("status", "e20d1-status-target"),
        );
      }),
    );

    it.effect("matches the skill's status byte output for an issue carrying colour and epic", () =>
      Effect.gen(function* () {
        const bytes = yield* readFixture(
          "roundtrip/colour-epic/4b42b-epic-carrier/4b42b-epic-carrier.md",
        );
        const parsed = parseIssue(bytes.toString("utf8"), "4b42b-epic-carrier");
        const next = applyStatus(parsed, { status: "read" }, NOW);
        expectBytes(
          Buffer.from(serializeIssue(next)),
          yield* readFixture(
            "after-special-colour-epic-status/4b42b-epic-carrier/4b42b-epic-carrier.md",
          ),
        );
      }),
    );

    it.effect("normalizes retired status input to the canonical name", () =>
      Effect.gen(function* () {
        const parsed = yield* loadBefore("e20d1-status-target");
        const next = applyStatus(parsed, { status: "do" }, NOW);
        expect(next.fm.status).toBe("doing");
      }),
    );

    it.effect("refuses a status outside the vocabulary", () =>
      Effect.gen(function* () {
        const parsed = yield* loadBefore("e20d1-status-target");
        expect(() => applyStatus(parsed, { status: "sideways" }, NOW)).toThrow(BoardRuleError);
      }),
    );

    it("refuses closing a parent with open direct children unless forced", () => {
      expect(() => assertStatusChildrenGuard("done", ["backlog", "done"], undefined)).toThrow(
        BoardRuleError,
      );
      expect(() => assertStatusChildrenGuard("done", ["backlog"], true)).not.toThrow();
      expect(() =>
        assertStatusChildrenGuard("done", ["done", "cancelled"], undefined),
      ).not.toThrow();
      expect(() => assertStatusChildrenGuard("doing", ["backlog"], undefined)).not.toThrow();
    });
  });

  describe("comment mutation equivalence", () => {
    it.effect("matches the skill's comment byte output", () =>
      Effect.gen(function* () {
        const parsed = yield* loadBefore("762b5-comment-target");
        const golden = (yield* goldenAfter("comment", "762b5-comment-target")).toString("utf8");
        const stamp = /- \*\*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\*\*/.exec(golden)?.[1];
        expect(stamp).toBeDefined();
        const next = applyComment(
          parsed,
          { text: "A comment lands here.", by: "tester" },
          stamp!,
          NOW,
        );
        expectBytes(Buffer.from(serializeIssue(next)), Buffer.from(golden, "utf8"));
      }),
    );

    it.effect("appends under an existing Log without a second header", () =>
      Effect.gen(function* () {
        const parsed = yield* loadBefore("762b5-comment-target");
        const first = applyComment(parsed, { text: "first" }, "2026-09-20 12:00", NOW);
        const second = applyComment(first, { text: "second" }, "2026-09-20 12:01", NOW);
        const body = second.body;
        expect(body.match(/^## Log$/gm)?.length).toBe(1);
        expect(body.indexOf("first")).toBeLessThan(body.indexOf("second"));
      }),
    );

    it.effect("creates a Log section when the body has none", () =>
      Effect.gen(function* () {
        const parsed = yield* loadBefore("55041-tag-target");
        const next = applyComment(parsed, { text: "logged" }, "2026-09-20 12:00", NOW);
        expect(next.body).toContain("## Log\n\n- **2026-09-20 12:00** logged\n");
      }),
    );
  });

  describe("tag mutation equivalence", () => {
    it.effect("matches the skill's tag-add byte output", () =>
      Effect.gen(function* () {
        const parsed = yield* loadBefore("55041-tag-target");
        const next = applyTag(parsed, { tag: "beta" }, NOW);
        expectBytes(
          Buffer.from(serializeIssue(next)),
          yield* goldenAfter("tag", "55041-tag-target"),
        );
      }),
    );

    it.effect("matches the skill's tag-remove byte output", () =>
      Effect.gen(function* () {
        const parsed = yield* loadBefore("64eb7-tag-remove-target");
        const next = applyTag(parsed, { tag: "alpha", remove: true }, NOW);
        expectBytes(
          Buffer.from(serializeIssue(next)),
          yield* goldenAfter("tag-remove", "64eb7-tag-remove-target"),
        );
      }),
    );

    it.effect("removes a tag case-insensitively like the skill's -ne comparison", () =>
      Effect.gen(function* () {
        const parsed = yield* loadBefore("64eb7-tag-remove-target");
        const next = applyTag(parsed, { tag: "ALPHA", remove: true }, NOW);
        expect(next.fm.tags).toEqual([]);
      }),
    );

    it.effect("is idempotent when adding an existing tag", () =>
      Effect.gen(function* () {
        const parsed = yield* loadBefore("64eb7-tag-remove-target");
        const next = applyTag(parsed, { tag: "alpha" }, NOW);
        expect(next.fm.tags).toEqual(["alpha"]);
      }),
    );
  });

  describe("link mutation equivalence", () => {
    it.effect("matches the skill's link-add byte output with the canonical target id", () =>
      Effect.gen(function* () {
        const parsed = yield* loadBefore("67e0c-link-target");
        const next = applyLink(
          parsed,
          { type: "blocks", target: "890fa-link-destination" },
          NOW,
          knownIds,
          "890fa-link-destination",
        );
        expectBytes(
          Buffer.from(serializeIssue(next)),
          yield* goldenAfter("link", "67e0c-link-target"),
        );
      }),
    );

    it.effect("matches the skill's link-remove byte output", () =>
      Effect.gen(function* () {
        const parsed = yield* loadBefore("4fbef-link-remove-target");
        const next = applyLink(
          parsed,
          { type: "blocks", target: "4110c-link-remove-destination", remove: true },
          NOW,
          knownIds,
          undefined,
        );
        expectBytes(
          Buffer.from(serializeIssue(next)),
          yield* goldenAfter("link-remove", "4fbef-link-remove-target"),
        );
      }),
    );

    it.effect("stores the canonical target id when the caller typed a short prefix", () =>
      Effect.gen(function* () {
        const parsed = yield* loadBefore("67e0c-link-target");
        const next = applyLink(
          parsed,
          { type: "blocks", target: "0c181" },
          NOW,
          knownIds,
          "890fa-link-destination",
        );
        expect(next.fm.links.blocks).toEqual(["890fa-link-destination"]);
      }),
    );

    it.effect("does not duplicate an edge already stored under a different spelling", () =>
      Effect.gen(function* () {
        const parsed = yield* loadBefore("4fbef-link-remove-target");
        const next = applyLink(
          parsed,
          { type: "blocks", target: "4110c" },
          NOW,
          knownIds,
          "4110c-link-remove-destination",
        );
        expect(next.fm.links.blocks).toEqual(["4110c-link-remove-destination"]);
      }),
    );

    it.effect("rejects a link type outside the vocabulary", () =>
      Effect.gen(function* () {
        const parsed = yield* loadBefore("67e0c-link-target");
        expect(() =>
          applyLink(
            parsed,
            { type: "mentions", target: "890fa-link-destination" },
            NOW,
            knownIds,
            "890fa-link-destination",
          ),
        ).toThrow(BoardRuleError);
      }),
    );
  });

  describe("rollup mutation equivalence", () => {
    it.effect("matches the skill's rollup byte output on the parent", () =>
      Effect.gen(function* () {
        const parent = yield* loadBefore("e594b-rollup-child");
        const child = yield* loadBefore("0fef4-rollup-grandchild");
        const next = applyRollup(
          parent,
          { id: child.fm.id, title: child.fm.title },
          { status: "done", text: "Resolved cleanly" },
          NOW,
        );
        expectBytes(
          Buffer.from(serializeIssue(next)),
          yield* goldenAfter("rollup", "e594b-rollup-child"),
        );
      }),
    );

    it.effect("replaces an existing child resolution line instead of appending a second one", () =>
      Effect.gen(function* () {
        const parent = yield* loadBefore("e594b-rollup-child");
        const first = applyRollup(
          parent,
          { id: "0fef4-rollup-grandchild", title: "Rollup grandchild" },
          { status: "done", text: "first" },
          NOW,
        );
        const second = applyRollup(
          first,
          { id: "0fef4-rollup-grandchild", title: "Rollup grandchild" },
          { status: "cancelled", text: "second" },
          NOW,
        );
        expect(second.body.match(/^- child 0fef4-rollup-grandchild/gm)?.length).toBe(1);
        expect(second.body).toContain("cancelled: second");
      }),
    );

    it.effect("inserts a Child resolutions section before an existing Log", () =>
      Effect.gen(function* () {
        const commented = applyComment(
          yield* loadBefore("762b5-comment-target"),
          { text: "context" },
          "2026-09-20 12:00",
          NOW,
        );
        const next = applyRollup(
          commented,
          { id: "0fef4-rollup-grandchild", title: "Rollup grandchild" },
          { status: "done", text: "text" },
          NOW,
        );
        expect(next.body.indexOf("## Child resolutions")).toBeGreaterThan(-1);
        expect(next.body.indexOf("## Child resolutions")).toBeLessThan(next.body.indexOf("## Log"));
      }),
    );
  });
});
