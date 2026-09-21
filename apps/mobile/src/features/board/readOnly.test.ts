import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const featureDir = fileURLToPath(new URL(".", import.meta.url));

function featureSources(): ReadonlyArray<{ readonly name: string; readonly source: string }> {
  return readdirSync(featureDir)
    .filter((name) => (/\.tsx?$/.test(name) || /\.ts$/.test(name)) && !/\.test\./.test(name))
    .map((name) => ({ name, source: readFileSync(`${featureDir}${name}`, "utf8") }));
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
