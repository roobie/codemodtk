MIGRATION PLAN: deno/jsr -> Bun

Summary

This document captures a concrete migration plan to move this repository (CodeMod Toolkit) from a Deno/jsr runtime to Bun (https://bun.sh). It expands the high-level plan produced earlier and includes Bun-specific notes, recommended dependency mappings, example code snippets, and commands to run. I consulted Bun's docs (https://bun.com/docs/llms.txt) while drafting this; that file is included in the repository as an authoritative reference for Bun runtime features and CLI guidance.

Goals

- Replace Deno runtime APIs and jsr import specifiers with Bun/npm equivalents.
- Preserve existing API semantics (filesystem operations, TypeScript transforms, patch application behavior).
- Make the project runnable with Bun (bun install, bun run, bun test) and integrate with CI.
- Keep changes localized where possible (create small shims to minimize touch points).

Contents

1) High-level steps
2) Bun-specific commentary and decisions
3) Concrete code-change examples (snippets)
4) Dependency mapping (Deno/@std -> npm/Bun)
5) Files to add and CI changes
6) Suggested developer commands and verification
7) Risks, pitfalls, and follow-up tasks

1) High-level migration steps

- Add Node/Bun package manifest
  - Create package.json with exports, scripts, and dependencies.
  - Add bun.lockb will be created by bun install.

- Add TypeScript config
  - Add tsconfig.json tuned for Bun (module: "esnext", moduleResolution: "node").

- Introduce a small runtime shim module
  - Provide wrappers for Deno.* APIs used in the codebase (readTextFile, writeTextFile, cwd, args, remove, Command/formatter glue, confirm helper).
  - Keep shim surface minimal so other code changes are mechanical replacements.

- Replace jsr:@std/* imports and jsr:/npm-style urls
  - Swap to npm packages (e.g. semver -> semver, @std/fmt/colors -> kleur/colorette).
  - Replace remote import-url usage by package dependencies where appropriate.

- Replace Deno.Command-based formatter with Prettier (or Bun's tooling)
  - The project used deno fmt; on Bun choose Prettier for stable formatting behavior.

- Replace ctx.fs.walk (Deno.walk) with fast-glob / Bun.glob or custom generator
  - Implement ctx.fs.walk adapter producing the same async-iterator shape used today.

- Replace interactive confirm() usages
  - Node/Bun do not provide browser confirm; add a small CLI prompt that respects --y/--yes and supports non-interactive CI.

- Adjust registry/import-map handling
  - The existing registry code can be preserved (it parses and manipulates string URLs), but how consumers reference dependencies will change: move dependency declarations to package.json when appropriate, or keep remote URLs as strings if still desired.

- Update GitHub actions / CI
  - Replace deno setup steps with actions/setup-bun (or use setup-node if running under node) and update jobs to run bun install, bun test, bun run build, etc.

- Run tests & iterate
  - Add unit tests (if missing) for critical modules (registry parsing, pkgInfo, rewriteImport). Run bun test and iterate until green.

2) Bun-specific commentary and decisions (from https://bun.com/docs/llms.txt)

- Package manager & lockfile
  - Bun uses bun install and creates bun.lockb (binary lockfile). It supports npm-compatible package.json, workspaces, and many modern package manager features. See "bun install" and "Lockfile" in Bun docs.

- Fast native APIs
  - Bun provides fast native implementations for many operations we use: file I/O, globbing (Bun.glob), spawn (Bun.spawn / Bun.spawnSync), and fetch. Consider using Bun's builtin glob or spawn for performance-critical code paths.

- TypeScript support
  - Bun has first-class TypeScript support and can run TS directly, but it's recommended to include tsconfig.json and devDependencies (typescript) for type-checking with tsc if CI requires strict checks. See "TypeScript" docs.

- Child processes & formatter
  - The project used Deno.Command to run deno fmt. On Bun you can use Bun.spawn or Bun.spawnSync to run external processes (Prettier, if chosen). Alternatively, prefer calling Prettier API directly in Node to avoid process overhead.

- Globals & fetch
  - Bun exposes fetch and many Web APIs on global, similar to Deno. Network code that relies on fetch should continue to work, but add abort/timeouts to long-running network requests.

- Test runner
  - Bun provides a fast built-in test runner (bun test) with snapshotting, concurrency control, and code coverage. Migrate Deno tests (if present) to Bun's runner or create Jest-like tests using Bun's API.

- Module resolution
  - Bun resolves modules as Node-style by default. Remote URL imports (JSR-style) are not a first-class package resolution mechanism in Bun; transition to package.json dependencies and local file imports. If the project expects remote import maps, preserve them as data strings but do not rely on runtime import resolution via URL specifiers.

- bunfig.toml
  - Bun supports bunfig.toml for configuration (test runner options, build options). Consider adding a bunfig.toml to control test behavior or build-time constants.

- CLI experience and auto-install
  - Bun supports auto-install when invoking a script that imports a package not present (Auto-install). For deterministic builds prefer running bun install in CI.

3) Concrete code-change examples (suggested patches / snippets)

A) runtime-shim: src/runtime-shim.ts (recommended)

- Purpose: centralize Deno -> Bun/Node runtime differences.
- Minimal API surface (examples): args, cwd(), readTextFile, writeTextFile, remove, exists, spawn/format.

Example (TypeScript):

import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { spawnSync } from "child_process"; // fallback used in some scripts

export const runtime = {
  args: process.argv.slice(2),
  cwd: () => process.cwd(),
  readTextFile: async (p: string) => {
    return fs.readFile(p, "utf8");
  },
  writeTextFile: async (p: string, content: string) => {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content, "utf8");
  },
  remove: async (p: string) => {
    await fs.rm(p, { recursive: true, force: true }).catch(() => {});
  },
  exists: async (p: string) => existsSync(p),
  spawnSync: (cmd: string, args: string[], opts: any) => spawnSync(cmd, args, opts),
};

Notes:
- Use Bun.spawn / Bun.spawnSync when running under Bun for better performance; keep spawnSync as fallback when running under Node.
- The shim keeps the rest of the codebase changes minimal: replace direct Deno.* uses with runtime.*.

B) formatter.ts -> use Prettier API

- Replace Deno.Command usage; prefer Prettier API for deterministic formatting.

Example:
import prettier from "prettier";
export async function format(content: string, filepath = "file.ts") {
  try {
    return prettier.format(content, { filepath, parser: "typescript" });
  } catch (err) {
    return content;
  }
}

C) DEFAULT_FS in src/codemod.ts

- Replace with the runtime shim and a walk adapter built on fast-glob or Bun.glob.
- Implement an async generator that yields objects { path, isFile } to match current usage.

D) Replace @std/semver and others

- Change imports: import * as semver from "semver"; and map semver.parse / compare accordingly.

4) Dependency mapping (recommendations)

- @std/fmt/colors -> kleur (or colorette/chalk)
- @std/fs -> fs-extra or Node fs + fast-glob
- @std/path -> path (Node builtin)
- @std/semver -> semver (npm)
- ts-morph -> ts-morph (already on npm)
- diff -> diff (npm) (already used via npm: specifier)
- deno.json / import_map.json -> package.json + tsconfig.paths as needed
- deno fmt -> prettier

5) Files to add / modify

Add:
- package.json (root)
- tsconfig.json
- src/runtime-shim.ts
- .gitignore: include bun.lockb
- bunfig.toml (optional)

Modify:
- src/codemod.ts: replace Deno.* and @std/* imports with runtime-shim and npm modules.
- src/formatter.ts: switch to Prettier or Bun.spawn
- src/update.lib.ts / registry.ts: replace @std/semver import and any Deno.* file ops
- mod.ts: ensure export points to compiled js (or keep as TS entry for Bun)
- .github/workflows/*.yaml: swap Deno setup to setup-bun and update steps

6) CI / commands

Local development commands (draft)

- Install dependencies
  bun install

- Type check
  bunx tsc --noEmit
  (or npm: npx tsc --noEmit)

- Format
  bunx prettier --write "src/**/*.{ts,tsx,js,jsx}"

- Test
  bun test

CI (GitHub Actions) adjustments

- Use actions/setup-bun (or run a script to install bun) and run:
  - bun install
  - bun test
  - bunx tsc --noEmit

7) Suggested verification and migration cadence

- Phase 0 (prep)
  - Add package.json, tsconfig.json, runtime-shim, and update README to document Bun usage.
  - Run bun install and ensure basic type check works.

- Phase 1 (mechanical replacements)
  - Replace imports (@std -> npm), swap Deno.* -> runtime shim. Run tests and fix compilation errors.

- Phase 2 (functional adjustments)
  - Replace formatter, fs.walk, and spawn usages.
  - Run integration flows (rewriteImports example) to ensure behavior preserved.

- Phase 3 (CI and polish)
  - Update GitHub Actions, add bunfig.toml, and run full CI.

8) Risks & pitfalls

- Remote URL import style (jsr:) doesn't match Node/Bun module resolution — you'll need to decide whether to keep remote URLs as data or convert them to package dependencies.
- Deno-specific features (permissions, deno.json workspace semantics) need mapping to package.json workspaces.
- Tests and runtime behaviour may reveal subtle differences in path handling and globbing.
- Child-process and formatting behaviour differs; prefer using Prettier programmatic API.

9) Estimated effort

- Mechanical migration (imports, shims, package.json): ~1–2 days.
- Full conversion (tests, CI, polishing): ~3–5 days.

References & notes

- Bun docs snapshot used: https://bun.com/docs/llms.txt (fetched via curl). See topics for Bun.spawn, Bun APIs, bun install, bun test, bunfig.toml, module resolution, and TypeScript support.
- Keep registry.ts and other network logic intact where possible; add network request timeouts.

Next steps I can do for you

- Generate package.json + tsconfig.json + runtime-shim.ts and apply mechanical import replacements as a draft PR in this repo.
- Produce the exact diff/patch for review instead of applying changes.
- Implement walk adapter and a Prettier-based formatter replacement to validate runtime behavior.

If you want me to apply the changes now, tell me which level of automation you prefer: produce patches for manual review, or apply changes directly and run a preliminary build/test locally.


MIGRATION LOG

- I consulted Bun docs via: https://bun.com/docs/llms.txt (fetched with curl)
- This document was added to the repo root as MIGRATE.md.


---

Generated by assistant on 2026-03-03T01:16:43Z
