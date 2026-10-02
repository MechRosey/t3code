import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { resolveUserDataPath } from "./DesktopUserData.ts";

it.effect("returns the t3todo profile when no prior profile exists", () =>
  Effect.gen(function* () {
    const userDataPath = yield* resolveUserDataPath({
      appDataDirectory: "/profiles",
      isDevelopment: false,
      platform: "win32",
    });
    assert.equal(userDataPath, "/profiles/t3todo");
  }).pipe(
    Effect.provideService(
      FileSystem.FileSystem,
      FileSystem.makeNoop({
        exists: () => Effect.succeed(false),
        readFileString: () => Effect.die("unexpected read"),
      }),
    ),
    Effect.provide(NodeServices.layer),
  ),
);

it.effect("keeps the existing t3todo profile state on Windows untouched", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-v2-profile-" });
    const destination = path.join(directory, "t3todo");
    const state = '{"os_crypt":{"encrypted_key":"test-encrypted-key"}}';
    yield* fs.makeDirectory(destination, { recursive: true });
    yield* fs.writeFileString(path.join(destination, "Local State"), state);
    yield* resolveUserDataPath({
      appDataDirectory: directory,
      isDevelopment: false,
      platform: "win32",
    });
    assert.equal(yield* fs.readFileString(path.join(destination, "Local State")), state);
    yield* fs.writeFileString(path.join(destination, "Local State"), "existing V2 state");
    yield* resolveUserDataPath({
      appDataDirectory: directory,
      isDevelopment: false,
      platform: "win32",
    });
    assert.equal(
      yield* fs.readFileString(path.join(destination, "Local State")),
      "existing V2 state",
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
