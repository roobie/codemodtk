import { expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CodeModContext, TextFile } from "@/codemod";
import { rewriteImports } from "@/codemod";

test("rewriteImports rewrites module specifier for a named import", async () => {
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "codemod-"));
	const file = path.join(tmp, "a.ts");
	await fs.writeFile(file, `import { oldExport } from "old-module";\n`);

	const symbolMap = {
		"old-module": {
			oldExport: { moduleSpecifier: "new-module" },
		},
	};

	const target = rewriteImports(symbolMap);
	const src = await fs.readFile(file, "utf8");
	const from: TextFile = { path: file, content: src };
	const ctx = {} as unknown as CodeModContext;
	const out = await target.apply(from, ctx);

	expect((out as { deleted?: true }).deleted).not.toBe(true);

	const content = (out as { content: string }).content;
	expect(content).toContain('from "new-module"');
});
