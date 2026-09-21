import { assert, describe, it } from "vite-plus/test";

import { normalizeTagInput, unusedBoardTags } from "./tagForm.logic";

describe("normalizeTagInput", () => {
  it("passes a simple tag through", () => {
    assert.deepEqual(normalizeTagInput("urgent", []), { tag: "urgent" });
  });

  it("trims surrounding whitespace", () => {
    assert.deepEqual(normalizeTagInput("  urgent  ", []), { tag: "urgent" });
  });

  it("keeps the input's casing when the tag is new", () => {
    assert.deepEqual(normalizeTagInput("Goal", ["other"]), { tag: "Goal" });
  });

  it("rejects an empty tag", () => {
    assert.equal(normalizeTagInput("", []), null);
  });

  it("rejects a whitespace-only tag", () => {
    assert.equal(normalizeTagInput("   \t ", []), null);
  });

  it("rejects a duplicate tag regardless of case", () => {
    assert.equal(normalizeTagInput("goal", ["Goal"]), null);
  });

  it("rejects a duplicate tag in the other case direction", () => {
    assert.equal(normalizeTagInput("GOAL", ["goal"]), null);
  });

  it("rejects an exact duplicate tag", () => {
    assert.equal(normalizeTagInput("Goal", ["Goal"]), null);
  });

  it("compares duplicates across the whole existing tag list", () => {
    assert.equal(normalizeTagInput("epic", ["read", "doing", "Epic"]), null);
  });
});

describe("unusedBoardTags", () => {
  it("keeps board tags the issue does not carry", () => {
    assert.deepEqual(unusedBoardTags(["a", "b", "c"], ["b"]), ["a", "c"]);
  });

  it("filters tags case-insensitively", () => {
    assert.deepEqual(unusedBoardTags(["goal", "other"], ["Goal"]), ["other"]);
  });

  it("returns every board tag when the issue has none", () => {
    assert.deepEqual(unusedBoardTags(["goal", "other"], []), ["goal", "other"]);
  });

  it("returns nothing when the issue already carries every board tag", () => {
    assert.deepEqual(unusedBoardTags(["Goal"], ["goal"]), []);
  });

  it("preserves the board tag order", () => {
    assert.deepEqual(unusedBoardTags(["zulu", "alpha"], ["mike"]), ["zulu", "alpha"]);
  });
});
