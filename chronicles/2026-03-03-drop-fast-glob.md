# Chronicle: Drop fast-glob and use Bun-native glob/walk

- timestamp: 2026-03-03T03:12:00+01:00
- participants: agent (automated), developer

## Summary
Removed the fast-glob dependency and updated the repository to prefer Bun.glob
for file enumeration. When Bun.glob is unavailable, the code falls back to a
recursive readdir implementation (no fast-glob dependency). This keeps the
project fast on Bun while remaining runnable in environments where Bun.glob is
not present.

## Files changed
- package.json — removed the `fast-glob` dependency.
- src/codemod.ts — removed the fast-glob import and updated `defaultWalk` to
  prefer Bun.glob and otherwise use a recursive readdir. Normalizes ordering
  for deterministic iteration.

## Commands run
- bunx biome check .
- bun test

## Notes
- Tests pass locally (4 tests). There is a small amount of formatting churn
  that Biome flagged but did not prevent the changes from being applied.
- We intentionally dropped the external fast-glob dependency per request. If
  you later want to restore feature parity (streaming or advanced glob flags),
  we can either reintroduce a fallback to fast-glob or extend the readdir-based
  walker.

## Next steps
- Update CI (GitHub Actions) to run tests under Bun and ensure Bun.glob is
  available in CI runners. If CI runners use Node-only environments, tests will
  still pass due to the readdir fallback.
