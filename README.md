# CodeMod Toolkit

CodeMod Toolkit is a small utility library to make scripted, repeatable changes
to code and configuration files in JavaScript and TypeScript projects. It
provides composable "file patchers" for text, JSON, and TypeScript sources,
plus a lightweight orchestration API (`codeMod`) to apply patches across a
project.

The examples below show representative usage patterns.

Importing

- From the published package (when installed):
  import { codeMod, rewriteImports, json } from "@roobie/codemodtk";

- From source (when developing locally) using the tsconfig path alias:
  import { codeMod, rewriteImports, json } from "@/codemod";

1) JSON patcher

Use json() to create a file patcher that accepts parsed JSON and returns a
modified JSON object. The wrapper will stringify with 2-space indentation.

Example:

```ts
import { json } from "@/codemod";

const patcher = json(async (jf) => {
  // jf.content is the parsed JSON object
  jf.content.scripts = jf.content.scripts || {};
  jf.content.scripts.test = "bun test";
  return { path: jf.path, content: jf.content };
});

// Use as a FilePatcher in a codeMod target.
```

2) Rewriting TypeScript imports (ts-morph)

The rewriteImports(symbolMap) helper produces a FilePatcher that uses
`ts-morph` to safely edit import declarations and preserve formatting.

Example:

```ts
import { rewriteImports } from "@/codemod";

const symbolMap = {
  "old-module": {
    oldExport: { moduleSpecifier: "new-module" },
  },
};

const importsTarget = rewriteImports(symbolMap);
```

3) Creating a custom TypeScript patcher (ts wrapper)

If you need direct access to the ts-morph SourceFile API, use the `ts()`
wrapper to write a TsPatcher that receives a ts-morph SourceFile.

Example:

```ts
import { ts } from "@/codemod";

const addExport = ts(async ({ content: sourceFile }) => {
  sourceFile.addFunction({ name: "hello", isExported: true, bodyText: 'console.log("hi")' });
  return { path: sourceFile.getFilePath(), content: sourceFile };
});
```

4) Orchestrating changes across a project (codeMod)

codeMod accepts a list of targets (file matchers + patchers) and applies the
patches. It supports dry-run previews and uses a pluggable filesystem context
for testing.

Example (simple text replace across files):

```ts
import { codeMod } from "@/codemod";

const replaceFooWithBar = {
  options: { match: [/\.ts$/], skip: [/node_modules/], includeDirs: false },
  apply: async (txt) => ({ path: txt.path, content: txt.content.replaceAll("foo", "bar") }),
};

await codeMod({ name: "Replace foo", targets: [replaceFooWithBar], yPrompt: false });
```

5) Tests and development

- Baseline tests are under `tests/` and use Bun's test runner. Run them with:
  bun test

- Tests import the codemod module using the tsconfig path alias (`@/codemod`)
  so you can run tests while developing against source.

Contributing

- Run `bunx biome check .` and `bunx tsc --noEmit` before committing.
- Add tests in `tests/` for new features or regressions.

License

MIT
