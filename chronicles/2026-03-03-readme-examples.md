# Chronicle: Add README examples and tests

- timestamp: 2026-03-03T03:05:00+01:00
- participants: agent

Summary
- Expanded README.md with more representative examples: ts() wrapper usage, overriding the filesystem (DEFAULT_FS) with an in-memory implementation, and guidance on skipping interactive prompts.
- Added tests to cover these examples:
  - tests/tsPatcher.test.ts — validates ts() wrapper adds an exported function using ts-morph.
  - tests/virtualFs.test.ts — validates codeMod works when provided with an in-memory filesystem via the context argument.

Commands run (representative)
- Edited README.md to include additional examples.
- Added tests/tsPatcher.test.ts and tests/virtualFs.test.ts.
- Ran `bun test` to verify all tests pass.

Files modified/added
- README.md (updated)
- tests/tsPatcher.test.ts (new)
- tests/virtualFs.test.ts (new)

Suggested next steps
- If you want the README examples to be runnable snippets, consider adding a small examples/ directory with runnable scripts demonstrating the examples end-to-end.
- Optionally export DEFAULT_FS from the module if you want consumers to import and reuse the default implementation.
