#!/usr/bin/env bun

/**
 * Usage examples:
 *  bunx codemod.ts text "old" "new"
 *  bunx codemod.ts regex "\\bOldThing\\b" "NewThing"
 *  bunx codemod.ts id OldName NewName
 *  bunx codemod.ts import "^@/old/(.*)$" "@/new/$1"
 *
 * Options:
 *  --dir <path>        (default "")
 *  --ext <csv>         (default "ts,tsx,js,jsx")
 *  --dry               (preview only; no writes)
 */

import path from "node:path";
import { parseArgs } from "node:util";
import { Project, SyntaxKind } from "ts-morph";

type Mode = "text" | "regex" | "id" | "import";

const { values, positionals } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		dir: { type: "string", default: "." },
		ext: { type: "string", default: "ts,tsx,js,jsx" },
		dry: { type: "boolean", default: false },
	},
	allowPositionals: true,
});

const [mode, a, b] = positionals as [Mode, string, string];

if (!mode || !a || !b || !["text", "regex", "id", "import"].includes(mode)) {
	console.error(
		[
			"Invalid args.",
			"Modes:",
			"  text   <from> <to>",
			"  regex  <pattern> <to>",
			"  id     <fromIdent> <toIdent>",
			"  import <pattern> <to>",
			"",
			"Examples:",
			'  bunx tsx codemod.ts text "foo" "bar"',
			'  bunx tsx codemod.ts regex "\\\\bFoo\\\\b" "Bar"',
			"  bunx tsx codemod.ts id OldName NewName",
			'  bunx tsx codemod.ts import "^@/old/(.*)$" "@/new/$1"',
			"",
			"Options: --dir . --ext ts,tsx --dry",
		].join("\n"),
	);
	process.exit(1);
}

const DIR = path.resolve(String(values.dir));
const EXTS = String(values.ext)
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);

const isCodeFile = (p: string) => EXTS.some((e) => p.endsWith(`.${e}`));

async function listFiles(dir: string): Promise<string[]> {
	const out: string[] = [];
	for (const entry of (await Bun.file(dir).exists())
		? await (async () => {
				// Bun doesn't expose recursive glob reliably across all envs; do manual walk
				const res: Array<{
					name: string;
					isFile: boolean;
					isDirectory: boolean;
				}> = [];
				for await (const e of (await Bun.readDir(dir)) as AsyncIterable<{
					name: string;
					isFile: boolean;
					isDirectory: boolean;
				}>)
					res.push(e);
				return res;
			})()
		: []) {
		const full = path.join(dir, entry.name);
		if (
			entry.isDirectory &&
			entry.name !== "node_modules" &&
			!entry.name.startsWith(".")
		) {
			out.push(...(await listFiles(full)));
		} else if (entry.isFile && isCodeFile(full)) {
			out.push(full);
		}
	}
	return out;
}

function replaceAllText(src: string, from: string, to: string) {
	if (from === "") return { changed: false, next: src, count: 0 };
	const count = src.split(from).length - 1;
	const next = count ? src.replaceAll(from, to) : src;
	return { changed: count > 0, next, count };
}

function replaceAllRegex(src: string, pattern: RegExp, to: string) {
	const matches = src.match(pattern);
	const count = matches?.length ?? 0;
	return { changed: count > 0, next: src.replace(pattern, to), count };
}

const files = await listFiles(DIR);

let totalFiles = 0;
let totalEdits = 0;

if (mode === "text" || mode === "regex") {
	const re = mode === "regex" ? new RegExp(a, "g") : null;

	for (const filePath of files) {
		const file = Bun.file(filePath);
		const src = await file.text();

		const res =
			mode === "text"
				? replaceAllText(src, a, b)
				: replaceAllRegex(src, re as RegExp, b);

		if (res.changed) {
			totalFiles++;
			totalEdits += res.count;

			if (values.dry) {
				console.log(`[dry] ${filePath} (${res.count} replacements)`);
			} else {
				await Bun.write(filePath, res.next);
				console.log(`${filePath} (${res.count} replacements)`);
			}
		}
	}

	console.log(
		`Done. Files changed: ${totalFiles}. Replacements: ${totalEdits}.`,
	);
	process.exit(0);
}

// AST modes (id/import)
const project = new Project({
	// Works well for mixed TS/JS repos; no tsconfig required.
	skipAddingFilesFromTsConfig: true,
	compilerOptions: { allowJs: true, checkJs: false },
});

for (const fp of files) project.addSourceFileAtPath(fp);

const sourceFiles = project.getSourceFiles();

if (mode === "id") {
	const fromIdent = a;
	const toIdent = b;

	// Record original file texts so we can compute which files changed.
	const originalTexts = new Map<string, string>();
	for (const sf of sourceFiles)
		originalTexts.set(sf.getFilePath(), sf.getFullText());

	const processedSymbols = new Set<string>();
	const planned = [] as Array<{ key: string; decls: string[] }>;

	for (const sf of sourceFiles) {
		const ids = sf.getDescendantsOfKind(SyntaxKind.Identifier);
		for (const id of ids) {
			if (id.getText() !== fromIdent) continue;

			const sym = id.getSymbol();
			if (!sym) {
				// Could be a bare identifier in a location without a symbol; skip for language-service rename.
				continue;
			}

			// Build a stable key for the symbol based on its declarations' file paths and positions.
			const decls = sym
				.getDeclarations()
				.map((d) => `${d.getSourceFile().getFilePath()}:${d.getStart()}`);
			const key = decls.sort().join("|");
			if (!key) continue;

			if (!processedSymbols.has(key)) {
				if (values.dry) {
					planned.push({ key, decls });
					processedSymbols.add(key);
				} else {
					try {
						// Use the ts-morph symbol rename which delegates to the language service
						sym.rename(toIdent);
						processedSymbols.add(key);
					} catch (err) {
						console.error(
							`Failed to rename symbol at ${decls.join(", ")}:`,
							err,
						);
					}
				}
			}
		}
	}

	if (values.dry) {
		console.log("Dry run. Planned symbol renames:");
		for (const p of planned)
			console.log(`  symbol declarations: ${p.decls.join(", ")}`);
		console.log(`Planned symbol renames: ${planned.length}`);
		process.exit(0);
	}

	// Persist changes
	await project.save();

	// Compute changed files and rough edit count by string-diff of the identifier name occurrences.
	let changedFiles = 0;
	let edits = 0;
	for (const sf of project.getSourceFiles()) {
		const fp = sf.getFilePath();
		const before = originalTexts.get(fp) ?? "";
		const after = sf.getFullText();
		if (before !== after) {
			changedFiles++;
			// Count naive textual occurrences replaced (best-effort).
			const beforeCount = before.split(fromIdent).length - 1;
			const afterCount = after.split(fromIdent).length - 1;
			edits += Math.max(0, beforeCount - afterCount);
		}
	}

	console.log(
		`Done. Files changed: ${changedFiles}. Symbols renamed: ${processedSymbols.size}. Identifier occurrences removed (approx): ${edits}.`,
	);
	process.exit(0);
}

if (mode === "import") {
	const pattern = new RegExp(a);
	const to = b;

	let changedFiles = 0;
	let edits = 0;

	for (const sf of sourceFiles) {
		let changed = false;

		for (const decl of sf.getImportDeclarations()) {
			const spec = decl.getModuleSpecifierValue();
			if (pattern.test(spec)) {
				const next = spec.replace(pattern, to);
				if (next !== spec) {
					decl.setModuleSpecifier(next);
					edits++;
					changed = true;
				}
			}
		}

		if (changed) {
			changedFiles++;
			if (values.dry)
				console.log(`[dry] ${sf.getFilePath()} (import rewrites)`);
			else await sf.save();
		}
	}

	console.log(`Done. Files changed: ${changedFiles}. Import edits: ${edits}.`);
	process.exit(0);
}
