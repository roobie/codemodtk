import { expect, test } from "bun:test";
import type { CodeModContext } from "@/codemod";
import { codeMod } from "@/codemod";

test("codeMod works with an in-memory filesystem override", async () => {
	const store: Record<string, string> = {
		"/virtual/a.txt": "foo",
	};

	const virtualFs = {
		cwd: () => "/virtual",
		exists: async (p: string) => p in store,
		readTextFile: async (p: string) => store[p],
		writeTextFile: async (p: string, content: string) => {
			store[p] = content;
		},
		ensureFile: async (_p: string) => {
			/* noop for in-memory */
		},
		remove: async (p: string) => {
			delete store[p];
		},
		walk: async function* (_cwd: string, _options: unknown) {
			for (const p of Object.keys(store)) {
				yield { path: p, isFile: true };
			}
		},
	};

	const target = {
		options: { match: [/\.txt$/], skip: [], includeDirs: false },
		apply: async (txt: { path: string; content: string }) => ({
			path: txt.path,
			content: txt.content.replaceAll("foo", "bar"),
		}),
	};

	await codeMod({
		targets: [target],
		context: { fs: virtualFs as unknown as CodeModContext },
		yPrompt: false,
	});

	expect(store["/virtual/a.txt"]).toBe("bar");
});
