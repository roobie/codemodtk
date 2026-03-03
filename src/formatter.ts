import { spawnSync } from "node:child_process";

/**
 * format content using Biome via CLI (stdin)
 * @param content the string content
 * @param filepath optional filepath to hint Biome about parser
 * @returns the formatted content or the original content on error
 */
export async function format(
	content: string,
	filepath = "file.ts",
): Promise<string> {
	try {
		const args = ["biome", "format", "--stdin-filepath", filepath];
		const proc = spawnSync("bunx", args, {
			input: content,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		if (proc.status === 0) {
			return proc.stdout as string;
		}
		return content;
	} catch (_err) {
		return content;
	}
}
