import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

export const fixturesRoot = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "__fixtures__",
);

export const readFixture = (relativePath: string): Buffer =>
  NodeFS.readFileSync(NodePath.join(fixturesRoot, relativePath));

export const findMarkerPath = (board: string, id: string): string => {
  const queue = [NodePath.join(fixturesRoot, board)];
  while (queue.length > 0) {
    const dir = queue.shift()!;
    for (const entry of NodeFS.readdirSync(dir, { withFileTypes: true })) {
      const full = NodePath.join(dir, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (entry.isFile() && entry.name === `${id}.md`) return full;
    }
  }
  throw new Error(`fixture marker not found for ${id} in ${board}`);
};
