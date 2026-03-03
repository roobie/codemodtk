# CodeMod Toolkit

CodeMod Toolkit is a small utility library to make scripted, repeatable changes
to code and configuration files in JavaScript and TypeScript projects. It
provides composable "file patchers" for text, JSON, and TypeScript sources,
plus a lightweight orchestration API (`codeMod`) to apply patches across a
project.

Important: this library is Bun-only. It requires the Bun runtime (and uses
Bun.glob for file enumeration). It is not intended to run under Node/Deno.

The examples below show representative usage patterns.

Importing

- From the published package (when installed):
  import { codeMod, rewriteImports, json } from "@roobie/codemodtk";

- (Alternative for local development) From source using the tsconfig path alias:
  import { codeMod, rewriteImports, json } from "@roobie/codemodtk";

1) JSON patcher

Use json() to create a file patcher that accepts parsed JSON and returns a
modified JSON object. The wrapper will stringify with 2-space indentation.

Example:

```ts
import { json } from "@roobie/codemodtk";

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
import { rewriteImports } from "@roobie/codemodtk";

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
import { ts } from "@roobie/codemodtk";

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
import { codeMod } from "@roobie/codemodtk";

const replaceFooWithBar = {
  options: { match: [/\.ts$/], skip: [/node_modules/], includeDirs: false },
  apply: async (txt) => ({ path: txt.path, content: txt.content.replaceAll("foo", "bar") }),
};

await codeMod({ name: "Replace foo", targets: [replaceFooWithBar], yPrompt: false });
```

How to skip the interactive prompt

- Pass `yPrompt: false` to codeMod to disable prompting and apply changes automatically.
- When running CLI-style, supply the `--y` flag to auto-confirm.

5) TypeScript patcher (ts wrapper)

When you need AST-aware edits, the `ts()` wrapper gives you direct access to a
`ts-morph` SourceFile so you can perform reliable, programmatic refactors.
The wrapper loads the file into a `ts-morph` Project and returns the modified
SourceFile's printed text — this preserves formatting better than ad-hoc
string replacements and lets you operate on the AST.

Basic example — add an exported function

```ts
import { ts } from "@roobie/codemodtk";

const addHello = ts(async ({ content: sourceFile }) => {
  sourceFile.addFunction({
    name: "hello",
    isExported: true,
    bodyText: "return 42;",
  });
  return { path: sourceFile.getFilePath(), content: sourceFile };
});
```

Rename a function and update references

```ts
import { ts } from "@roobie/codemodtk";

const renameFn = ts(async ({ content: sourceFile }) => {
  // Find the function declaration to rename
  const fn = sourceFile.getFunction("oldName");
  if (fn) {
    fn.rename("newName");
    // ts-morph will update all references inside the project when using
    // `project.getLanguageService().findReferences` (advanced) — for simple
    // single-file renames, `rename` is often sufficient.
  }
  return { path: sourceFile.getFilePath(), content: sourceFile };
});
```

Change a function signature

```ts
import { ts } from "@roobie/codemodtk";

const changeSignature = ts(async ({ content: sourceFile }) => {
  const fn = sourceFile.getFunction("compute");
  if (fn) {
    fn.set({ parameters: [{ name: "opts", type: "{ verbose?: boolean }" }] });
    // You can also update the body to adapt to the new parameter shape.
  }
  return { path: sourceFile.getFilePath(), content: sourceFile };
});
```

Migrate a default export into a named export

```ts
import { ts } from "@roobie/codemodtk";

const defaultToNamed = ts(async ({ content: sourceFile }) => {
  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    // Create a new named export and remove the default export.
    // This example shows the general idea; exact steps depend on the node kind.
    const defaultDecl = sourceFile.getExportAssignment(() => true);
    if (defaultDecl) {
      // turn `export default foo` into `export { foo }`
      const expr = defaultDecl.getExpression()?.getText();
      if (expr) {
        sourceFile.addExportDeclaration({ namedExports: [{ name: expr }] });
        defaultDecl.remove();
      }
    }
  }
  return { path: sourceFile.getFilePath(), content: sourceFile };
});
```

Remove unused imports and add a type-only import

```ts
import { ts } from "@roobie/codemodtk";

const tidyImports = ts(async ({ content: sourceFile }) => {
  // Remove all unused imports in a file
  sourceFile.getImportDeclarations().forEach((decl) => {
    const named = decl.getNamedImports();
    if (named.length === 0) return;
    const used = named.filter((n) => {
      const name = n.getName();
      return sourceFile.getDescendantsOfKind(tsmorph.SyntaxKind.Identifier).some(id => id.getText() === name);
    });
    if (used.length === 0) decl.remove();
  });

  // Add a type-only import example
  sourceFile.addImportDeclaration({
    moduleSpecifier: "./types",
    namedImports: [{ name: "MyType", isTypeOnly: true }],
  });

  return { path: sourceFile.getFilePath(), content: sourceFile };
});
```

Combine ts() with rewriteImports for larger migrations

```ts
import { ts, rewriteImports, codeMod } from "@roobie/codemodtk";

const renameSymbolTarget = rewriteImports({
  "old-package": { OldName: { moduleSpecifier: "new-package", name: "NewName" } },
});

const fixLocalFiles = ts(async ({ content: sourceFile }) => {
  // local, file-specific fixes
  return { path: sourceFile.getFilePath(), content: sourceFile };
});

await codeMod({ targets: [renameSymbolTarget, { options: { match: [/\.ts$/], skip: [/node_modules/], includeDirs: false }, apply: fixLocalFiles }], yPrompt: false });
```

Advanced notes and tips

- If you need type-aware refactors (finding references across files, moving
  symbols, or relying on tsconfig paths), consider creating a `ts-morph`
  Project with your tsconfig and performing multi-file edits via the project
  API. If the `ts()` wrapper is not sufficient for your needs, implement a
  FilePatcher that constructs and reuses a `Project` instance.

- `ts-morph` mutates the project in-memory. After making changes, call
  `sourceFile.save()` (or use the printed text returned by this library's
  `ts()` wrapper) to persist changes.

- Keep edits small and well-scoped — large AST transforms are easier to
  reason about when split into several patchers and run as separate
  codeMod targets.

6) Overriding the filesystem (DEFAULT_FS) for tests or dry-runs

codeMod uses a pluggable `fs` implementation so you can provide an in-memory
or mocked filesystem when running tests.

Example (in-memory override):

```ts
import { codeMod } from "@roobie/codemodtk";

const virtualFs = {
  cwd: () => "/virtual",
  exists: async (p: string) => p in store,
  readTextFile: async (p: string) => store[p],
  writeTextFile: async (p: string, content: string) => { store[p] = content; },
  ensureFile: async (p: string) => { /* create parent key in store */ },
  remove: async (p: string) => { delete store[p]; },
  walk: async function* (cwd, options) {
    for (const p of Object.keys(store)) {
      yield { path: p, isFile: true };
    }
  },
};

await codeMod({ targets: [/* your targets */], context: { fs: virtualFs }, yPrompt: false });
```

7) Tests and development

- Baseline tests are under `tests/` and use Bun's test runner. Run them with:
  bun test

- Tests import the codemod module using the tsconfig path alias (`@/codemod`)
  so you can run tests while developing against source.

Contributing

- Run `bun run check` before committing.
- Add tests in `tests/` for new features or regressions.
