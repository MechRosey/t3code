import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = NodePath.resolve(NodeURL.fileURLToPath(new URL("../", import.meta.url)));
const allowedWhitespace = new Set([0x09, 0x0a, 0x0d]);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const skippedDirectories = new Set(["node_modules", ".repos", ".git"]);

function collectSourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of NodeFS.readdirSync(dir, { withFileTypes: true })) {
      if (skippedDirectories.has(entry.name)) {
        continue;
      }
      const fullPath = NodePath.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (sourceExtensions.has(NodePath.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  };
  for (const scope of ["apps", "packages"]) {
    for (const project of NodeFS.readdirSync(NodePath.join(repoRoot, scope), {
      withFileTypes: true,
    })) {
      if (!project.isDirectory()) {
        continue;
      }
      const srcDir = NodePath.join(repoRoot, scope, project.name, "src");
      if (NodeFS.existsSync(srcDir) && NodeFS.statSync(srcDir).isDirectory()) {
        walk(srcDir);
      }
    }
  }
  return files;
}

describe("source byte hygiene", () => {
  it("keeps raw C0 control bytes out of first-party source", () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles()) {
      const bytes = NodeFS.readFileSync(file);
      for (let index = 0; index < bytes.length; index += 1) {
        const byte = bytes[index]!;
        if (byte < 0x20 && !allowedWhitespace.has(byte)) {
          offenders.push(
            `${NodePath.relative(repoRoot, file)} @ offset ${index} (0x${byte.toString(16).padStart(2, "0")})`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
