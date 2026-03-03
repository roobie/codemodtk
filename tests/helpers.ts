import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function mkTempDir(prefix = "codemod-") {
	return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeFile(dir: string, name: string, content: string) {
	const p = path.join(dir, name);
	await fs.writeFile(p, content, "utf8");
	return p;
}
