import { expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CodeModContext, TextFile } from "@/codemod";
import { ts } from "@/codemod";

// Ensure we restore CWD after test
const origCwd = process.cwd();

test("ts wrapper can add an exported function", async () => {
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "codemod-"));
	process.chdir(tmp);
	try {
		const file = path.join(tmp, "a.ts");
		await fs.writeFile(file, `export const x = 1;\n`);

		const patcher = ts(async ({ content: sourceFile }) => {
			sourceFile.addFunction({
				name: "hello",
				isExported: true,
				bodyText: "return 42;",
			});
			return { path: sourceFile.getFilePath(), content: sourceFile };
		});

		const src = await fs.readFile(file, "utf8");
		const input: TextFile = { path: file, content: src };
		const ctx = {} as unknown as CodeModContext;
		const out = await patcher(input, ctx);
		const content = (out as { content: string }).content;
		expect(content).toContain("export function hello");
	} finally {
		process.chdir(origCwd);
	}
});
