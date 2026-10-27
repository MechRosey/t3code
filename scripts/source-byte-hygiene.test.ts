import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";

const allowedWhitespace = new Set([0x09, 0x0a, 0x0d]);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const skippedDirectories = new Set(["node_modules", ".repos", ".git"]);
const sourceScopes = ["apps", "packages"];

const walkSourceFiles = (
  directory: string,
): Effect.Effect<string[], PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files: string[] = [];
    for (const name of yield* fs.readDirectory(directory)) {
      if (skippedDirectories.has(name)) continue;
      const fullPath = path.join(directory, name);
      const info = yield* fs.stat(fullPath);
      if (info.type === "Directory") {
        files.push(...(yield* walkSourceFiles(fullPath)));
      } else if (sourceExtensions.has(path.extname(name))) {
        files.push(fullPath);
      }
    }
    return files;
  });

const collectSourceFiles = (repoRoot: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files: string[] = [];
    for (const scope of sourceScopes) {
      for (const project of yield* fs.readDirectory(path.join(repoRoot, scope))) {
        const srcDir = path.join(repoRoot, scope, project, "src");
        if (yield* fs.exists(srcDir)) files.push(...(yield* walkSourceFiles(srcDir)));
      }
    }
    return files;
  });

const findRawControlBytes = (repoRoot: string, file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const bytes = yield* fs.readFile(file);
    const offenders: string[] = [];
    for (let index = 0; index < bytes.length; index += 1) {
      const byte = bytes[index]!;
      if (byte < 0x20 && !allowedWhitespace.has(byte)) {
        offenders.push(
          `${path.relative(repoRoot, file)} @ offset ${index} (0x${byte.toString(16).padStart(2, "0")})`,
        );
      }
    }
    return offenders;
  });

it.layer(NodeServices.layer)("source byte hygiene", (it) => {
  it.effect("keeps raw C0 control bytes out of first-party source", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const repoRoot = yield* path.fromFileUrl(new URL("../", import.meta.url));
      const offenders: string[] = [];
      for (const file of yield* collectSourceFiles(repoRoot)) {
        offenders.push(...(yield* findRawControlBytes(repoRoot, file)));
      }
      assert.deepEqual(offenders, []);
    }),
  );
});
