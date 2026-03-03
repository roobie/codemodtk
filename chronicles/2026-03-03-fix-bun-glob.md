# Chronicle: Fix Bun.Glob usage in defaultWalk

- timestamp: 2026-03-03T02:35:00+01:00
- participants: agent

Summary
- Fixed TypeScript errors caused by incorrect Bun glob usage in src/codemod.ts.

Details
- Problem: defaultWalk used `Bun.Glob(...)` like a callable which caused tsc errors:
  - "Property 'glob' does not exist on type 'typeof import("bun")'. Did you mean 'Glob'?"
  - "Value of type 'typeof Glob' is not callable. Did you mean to include 'new'?"
- Fix: Use `new Bun.Glob(...)` and collect entries with `for await` into an array, then sort the array for deterministic ordering.

Commands run (representative)
- Edited src/codemod.ts replacing direct Bun.Glob(...) calls with `for await (const entry of new Bun.Glob(...)) entries.push(entry)`.

Files modified
- src/codemod.ts

Suggested next steps
- Run `bun run check` locally to verify TypeScript build and tests.
- After confirming, remove fast-glob from package.json and lockfile, and complete the remaining fast-glob references in docs/chronicles.
