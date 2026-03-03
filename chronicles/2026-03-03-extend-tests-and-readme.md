# Chronicle: Extend tests and update README

- timestamp: 2026-03-03T03:01:00+01:00
- participants: agent (automated), developer

## Summary
Extended the baseline test suite with end-to-end tests for codeMod orchestration
and file deletion, and updated README.md with representative examples covering
all primary use cases (json patcher, rewriteImports, ts wrapper, and codeMod).

Ran `bun test` locally — all tests passed.

## Commands run
- bunx biome check .
- bun test

## Files added/modified
- tests/codeModEndToEnd.test.ts — new: end-to-end tests for codeMod apply/delete.
- README.md — updated with usage examples for json, rewriteImports, ts, codeMod.
- chronicles/2026-03-03-extend-tests-and-readme.md — this chronicle entry.

## Next steps
- Add CI workflow to run bun test and checks.
- Add more tests for edge cases and registry utilities.
