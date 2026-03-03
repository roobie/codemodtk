# Chronicle: Add Bun types to tsconfig

- timestamp: 2026-03-03T02:16:43+01:00
- participants: agent

Summary
- Fixed TypeScript build error: "Cannot find name 'Bun'" by including Bun types in tsconfig.

Commands run (representative)
- Edited tsconfig.json to include "bun" in the `types` compilerOptions array.

Files modified
- tsconfig.json

Representative patch
- Replaced:
  "types": ["node"],
  With:
  "types": ["node", "bun"],

Suggested next steps
- Run `bun install` to ensure @types/bun is installed (package.json already lists @types/bun).
- Run `bun run check` locally to validate the build, lint, and tests.
- If other TypeScript errors reference Bun globals, ensure @types/bun package version is compatible or switch to `bun-types` if needed.
