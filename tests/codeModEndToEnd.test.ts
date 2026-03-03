import { expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { codeMod } from "@/codemod";

// Ensure we restore CWD after test
const origCwd = process.cwd();

test("codeMod applies text replacement across files", async () => {
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "codemod-"));
	process.chdir(tmp);
	try {
		await fs.writeFile(path.join(tmp, "a.txt"), "hello old\n");
		await fs.writeFile(path.join(tmp, "b.txt"), "old world\n");

		const target = {
			options: { match: [/\.txt$/], skip: [], includeDirs: false },
			apply: async (txt: { path: string; content: string }) => {
				return {
					path: txt.path,
					content: txt.content.replaceAll("old", "new"),
				};
			},
		};

		await codeMod({ targets: [target], yPrompt: false });

		const a = await fs.readFile(path.join(tmp, "a.txt"), "utf8");
		const b = await fs.readFile(path.join(tmp, "b.txt"), "utf8");
		expect(a).toContain("hello new");
		expect(b).toContain("new world");
	} finally {
		process.chdir(origCwd);
	}
});

test("codeMod can delete files when a patch returns deleted", async () => {
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "codemod-"));
	process.chdir(tmp);
	try {
		await fs.writeFile(path.join(tmp, "todelete.txt"), "bye\n");
		await fs.writeFile(path.join(tmp, "keep.txt"), "keep\n");

		const target = {
			options: { match: [/\.txt$/], skip: [], includeDirs: false },
			apply: async (txt: { path: string; content: string }) => {
				if (txt.path.endsWith("todelete.txt")) {
					return { deleted: true } as { deleted: true };
				}
				return { path: txt.path, content: txt.content };
			},
		};

		await codeMod({ targets: [target], yPrompt: false });

		let existsDeleted = true;
		try {
			await fs.stat(path.join(tmp, "todelete.txt"));
		} catch (_e) {
			existsDeleted = false;
		}
		expect(existsDeleted).toBe(false);
		const keep = await fs.readFile(path.join(tmp, "keep.txt"), "utf8");
		expect(keep).toContain("keep");
	} finally {
		process.chdir(origCwd);
	}
});
