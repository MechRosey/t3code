import { describe, expect, it } from "@effect/vitest";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { parseIssue, serializeIssue, toYamlList } from "./frontmatter.ts";
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

it.layer(NodeServices.layer)("parseIssue", (it) => {
  it.effect.each(issueIds)("round-trips fixture %s to the skill's save form", (id) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const markerPath = yield* findMarkerPath("board-before", id);
      const text = yield* fs.readFileString(markerPath);
      const first = serializeIssue(parseIssue(text, id));
      const saveForm = text.endsWith("\n") ? text.slice(0, -1) : text;
      expect(first).toBe(saveForm);
      expect(serializeIssue(parseIssue(first, id))).toBe(first);
    }),
  );

  it.effect("discards lines before the frontmatter fence, matching the skill's reader", () =>
    Effect.sync(() => {
      const parsed = parseIssue("no frontmatter here\n", "abc12-some-issue");
      expect(parsed.fm.id).toBe("abc12-some-issue");
      expect(parsed.fm.title).toBe("abc12-some-issue");
      expect(parsed.fm.status).toBe("backlog");
      expect(parsed.fm.created).toBe("");
      expect(parsed.fm.updated).toBe("");
      expect(parsed.fm.tags).toEqual([]);
      expect(parsed.fm.links).toEqual({ blocks: [], relates: [] });
      expect(parsed.body).toBe("");
    }),
  );

  it.effect("strips a leading BOM and keeps the round-trip BOM-free", () =>
    Effect.gen(function* () {
      const bytes = yield* readFixture("roundtrip/bom/e20d1-status-target/e20d1-status-target.md");
      expect(bytes[0]).toBe(0xef);
      const parsed = parseIssue(bytes.toString("utf8"), "e20d1-status-target");
      expect(parsed.fm.title).toBe("Status target");
      const serialized = Buffer.from(serializeIssue(parsed));
      expect(serialized[0]).not.toBe(0xef);
      const golden = yield* readFixture(
        "after-special-bom-status/e20d1-status-target/e20d1-status-target.md",
      );
      expect(Buffer.compare(serialized, golden)).toBe(0);
    }),
  );

  it.effect("normalizes a CRLF body to LF while the frontmatter stays CRLF", () =>
    Effect.gen(function* () {
      const bytes = yield* readFixture(
        "roundtrip/crlf-body/e20d1-status-target/e20d1-status-target.md",
      );
      const text = bytes.toString("utf8");
      expect(text.includes("\r\n")).toBe(true);
      const parsed = parseIssue(text, "e20d1-status-target");
      expect(parsed.body.includes("\r")).toBe(false);
      const golden = yield* readFixture(
        "after-special-crlf-body-status/e20d1-status-target/e20d1-status-target.md",
      );
      expect(Buffer.compare(Buffer.from(serializeIssue(parsed)), golden)).toBe(0);
    }),
  );

  it.effect("tolerates unknown frontmatter fields on read and drops them on serialize", () =>
    Effect.gen(function* () {
      const bytes = yield* readFixture(
        "roundtrip/unknown-fields/e20d1-status-target/e20d1-status-target.md",
      );
      expect(bytes.toString("utf8").includes("custom-field: keep me")).toBe(true);
      const parsed = parseIssue(bytes.toString("utf8"), "e20d1-status-target");
      const golden = yield* readFixture(
        "after-special-unknown-fields-status/e20d1-status-target/e20d1-status-target.md",
      );
      expect(Buffer.compare(Buffer.from(serializeIssue(parsed)), golden)).toBe(0);
    }),
  );

  it.effect("keeps colour and epic fields through the round-trip", () =>
    Effect.gen(function* () {
      const bytes = yield* readFixture(
        "roundtrip/colour-epic/4b42b-epic-carrier/4b42b-epic-carrier.md",
      );
      const text = bytes.toString("utf8");
      const parsed = parseIssue(text, "4b42b-epic-carrier");
      expect(parsed.fm.colour).toBe("217");
      expect(parsed.fm.epic).toBe("Foundation");
      expect(parsed.fm.tags).toEqual(["Epic", "Foundation"]);
      const first = serializeIssue(parsed);
      expect(first.match(/^colour:/gm)?.length).toBe(1);
      expect(first).toContain("colour: 217");
      expect(first).toContain("epic: Foundation");
      expect(serializeIssue(parseIssue(first, "4b42b-epic-carrier"))).toBe(first);
    }),
  );

  it.effect("dual-reads a retired status into its canonical name without rewriting the body", () =>
    Effect.sync(() => {
      const raw = [
        "---",
        "id: abc12-retired",
        "title: Retired vocabulary",
        "status: do",
        "created: 2026-09-20 12:00",
        "updated: 2026-09-20 12:00",
        "tags: []",
        "links:",
        "  blocks: []",
        "  relates: []",
        "---",
        "",
        "# Retired vocabulary",
        "",
        "## Summary",
        "",
        "INVESTIGATION-COMPLETE",
        "",
        "## Log",
        "",
      ].join("\n");
      const parsed = parseIssue(raw, "abc12-retired");
      expect(parsed.fm.status).toBe("doing");
      expect(parsed.body).toContain("## Summary");
      expect(parsed.body).toContain("INVESTIGATION-COMPLETE");
      const serialized = serializeIssue(parsed);
      expect(serialized).toContain("status: doing");
      expect(serialized).toContain("## Summary");
      expect(serialized).toContain("INVESTIGATION-COMPLETE");
    }),
  );
});

describe("toYamlList", () => {
  it("renders the skill's inline list form", () => {
    expect(toYamlList([])).toBe("[]");
    expect(toYamlList(["one"])).toBe("[one]");
    expect(toYamlList(["one", "two"])).toBe("[one, two]");
  });
});
