import * as NodeURL from "node:url";

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

class FixtureMarkerNotFound extends Data.TaggedError("FixtureMarkerNotFound")<{
  readonly message: string;
}> {}

const fixturesUrl = new URL("__fixtures__/", import.meta.url);

export const fixturesRoot = NodeURL.fileURLToPath(fixturesUrl);

const fixturePath = (relative: string): string =>
  NodeURL.fileURLToPath(new URL(relative.replace(/\\/g, "/"), fixturesUrl));

export const readFixture = (relativePath: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    Effect.map(fs.readFile(fixturePath(relativePath)), Buffer.from),
  );

export const findMarkerPath = (board: string, id: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(fixturePath(board), { recursive: true });
    const match = entries
      .map((entry) => entry.replace(/\\/g, "/"))
      .find((entry) => entry.endsWith(`/${id}.md`));
    if (match === undefined) {
      return yield* new FixtureMarkerNotFound({
        message: `fixture marker not found for ${id} in ${board}`,
      });
    }
    return fixturePath(`${board}/${match}`);
  });
