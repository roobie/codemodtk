import { expect, test } from "bun:test";
import type { CodeModContext, TextFile } from "@/codemod";
import { json } from "@/codemod";

test("json patcher applies changes and returns formatted JSON", async () => {
	const patcher = json(async (jf) => {
		jf.content.added = "ok";
		return { path: jf.path, content: jf.content };
	});

	const input: TextFile = {
		path: "package.json",
		content: JSON.stringify({ name: "foo" }),
	};

	const ctx = {} as unknown as CodeModContext;
	const result = await patcher(input, ctx);
	// result is either Delete or OptPath<JSONFile>
	expect(typeof result).toBe("object");
	const content = (result as { content: string }).content;
	expect(content).toContain('"added": "ok"');
	expect(content).toMatch(/\{\n {2}"name": "foo",\n {2}"added": "ok"\n\}\n/);
});
