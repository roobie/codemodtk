# Chronicle: Migrate plan -> Bun

- Timestamp: 2026-03-03T01:16:43Z
- Participants: user, assistant (AI)

Summary

Created a migration plan to move this repository (CodeMod Toolkit) from Deno/jsr to Bun. The migration plan is stored at MIGRATE.md in the repository root and includes Bun-specific commentary, mapping of Deno/@std features to Bun/npm equivalents, code snippets, CI notes, and an action plan.

Actions taken

- Ran repository bootstrap check:
  - `sg list` (no bookmarks found)
- Fetched Bun docs index to ground Bun-specific guidance:
  - `curl -sS https://bun.com/docs/llms.txt -o /tmp/bun-llms.txt`
- Created MIGRATE.md at the repository root with the migration plan and Bun-specific notes.
- Created this chronicle entry under chronicles/2026-03-03-migrate-to-bun.md

Representative commands run

- sg list
- curl -sS https://bun.com/docs/llms.txt -o /tmp/bun-llms.txt
- (wrote) MIGRATE.md
- (wrote) chronicles/2026-03-03-migrate-to-bun.md

Files added/modified

- Added: MIGRATE.md (migration plan + Bun commentary)
- Added: chronicles/2026-03-03-migrate-to-bun.md (this chronicle entry)

Suggested next steps

1. Review MIGRATE.md and confirm whether to: (A) auto-apply mechanical changes (package.json, runtime-shim, import replacements) or (B) produce patches for review.
2. If auto-apply: I can generate package.json, tsconfig.json, src/runtime-shim.ts and produce the codemod to update imports and Deno.* usages.
3. Add a lightweight test or run `bun test` after changes to validate behavior; add timeouts/retries for network fetches in registry code.

Notes & caveats

- The project contains a "codebase-analysis" skill that instructed invoking a python script; the script could not be executed because the skills path/module was not available in this environment. Migration plan was produced with local static analysis.
- The Bun docs snapshot used for guidance was fetched and referenced in MIGRATE.md.

Assistant signature

assistant (AI)
