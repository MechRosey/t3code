import * as NodeURL from "node:url";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

class FixtureMarkerNotFound extends Schema.TaggedError<FixtureMarkerNotFound>()(
  "FixtureMarkerNotFound",
  { message: Schema.String },
) {}

const fixturesUrl = new URL("__fixtures__/", import.meta.url);

export const fixturesRoot = NodeURL.fileURLToPath(fixturesUrl);

const fixturePath = (relative: string): string =>
  NodeURL.fileURLToPath(new URL(relative.replace(/\\/g, "/"), fixturesUrl));

export const readFixture = (relativePath: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    Effect.map(fs.readFile(fixturePath(relativePath)), Buffer.from),
  );

export const findMarkerPath = Effect.fn("findMarkerPath")(function* (board: string, id: string) {
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

export const installBoard = Effect.fn("installBoard")(function* (fixtureBoard: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const target = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-board-" });
  const boardDir = path.join(target, "project", ".todo");
  yield* fs.copy(path.join(fixturesRoot, fixtureBoard), boardDir);
  const cwd = path.join(target, "project", "sub", "deep");
  yield* fs.makeDirectory(cwd, { recursive: true });
  return { target, boardDir, cwd };
});
