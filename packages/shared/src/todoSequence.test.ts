import { describe, expect, it } from "vite-plus/test";

import { joinSequenceEntry, sequenceEntryIds } from "./todoSequence.ts";

describe("sequenceEntryIds", () => {
  it("sequenceEntryIds_PlainGroupAndPaddedEntries_SplitsOnWhitespaceRuns", () => {
    expect(sequenceEntryIds("a1b2c")).toEqual(["a1b2c"]);
    expect(sequenceEntryIds("a1b2c d3e4f")).toEqual(["a1b2c", "d3e4f"]);
    expect(sequenceEntryIds("  a1b2c \t d3e4f\r\n")).toEqual(["a1b2c", "d3e4f"]);
    expect(sequenceEntryIds("   ")).toEqual([]);
  });

  it("joinSequenceEntry_Ids_RoundTripsThroughSequenceEntryIds", () => {
    const group = ["a1b2c", "d3e4f"];

    const entry = joinSequenceEntry(group);

    expect(entry).toBe("a1b2c d3e4f");
    expect(sequenceEntryIds(entry)).toEqual(group);
    expect(joinSequenceEntry(["a1b2c"])).toBe("a1b2c");
  });
});
