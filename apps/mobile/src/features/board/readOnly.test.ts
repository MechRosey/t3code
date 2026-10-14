import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const featureDir = NodeURL.fileURLToPath(new URL(".", import.meta.url));

function featureSources(): ReadonlyArray<{ readonly name: string; readonly source: string }> {
  return NodeFS.readdirSync(featureDir)
    .filter((name) => (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.includes(".test."))
    .map((name) => ({
      name,
      source: NodeFS.readFileSync(`${featureDir}${name}`, "utf8"),
    }));
}

describe("board feature read-only invariant", () => {
  it("references no board mutation entry point", () => {
    const violations = featureSources().filter(({ source }) => /\bmutate\b/i.test(source));
    expect(violations.map(({ name }) => name)).toEqual([]);
  });

  it("consumes the board through read or subscribe", () => {
    const consumers = featureSources().filter(({ source }) =>
      /todoBoard\.(read|subscribe)/.test(source),
    );
    expect(consumers.length).toBeGreaterThan(0);
  });
});
