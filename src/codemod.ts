import { promises as fs } from "node:fs";
import path from "node:path";
import * as diff from "diff";

import kleur from "kleur";

const { gray, green, red, yellow } = kleur;

import { Glob } from "bun";
import {
	type ImportDeclarationStructure,
	Project,
	type SourceFile,
	StructureKind,
} from "ts-morph";
import { format } from "./formatter.ts";

/**
 * Represents a text file with its path and content.
 */
export interface TextFile {
	path: string;
	content: string;
}

/**
 * Represents a deletion operation on a file.
 */
export interface Delete {
	deleted: true;
}

/**
 * Represents a modification from one version of a file to another.
 */
export interface PatchFileMod {
	from: TextFile;
	to: TextFile;
}

/**
 * Represents a modification where a file has been deleted.
 */
export interface DeleteFileMod {
	from: TextFile;
	to: Delete;
}

/**
 * Represents a modification where a file has been created.
 */
export interface CreateFileMod {
	to: TextFile;
}

/**
 * A union type representing different types of file modifications.
 */
export type FileMod = PatchFileMod | DeleteFileMod | CreateFileMod;

/**
 * Checks if a file modification is a delete operation.
 * @param {FileMod} f - The file modification to check.
 * @returns {f is DeleteFileMod} True if the modification is a delete operation.
 */
const isDelete = (f: FileMod): f is DeleteFileMod => {
	return (f as DeleteFileMod)?.to?.deleted === true;
};

/**
 * Checks if a file modification is a patch operation.
 * @param {FileMod} f - The file modification to check.
 * @returns {f is PatchFileMod} True if the modification is a patch operation.
 */
const isPatch = (f: FileMod): f is PatchFileMod => {
	return "from" in f && "to" in f && !(f as DeleteFileMod)?.to?.deleted;
};

/**
 * Provides filesystem operations and the current working directory.
 */
export interface CodeModContext {
	fs: {
		cwd: () => string;
		exists: (path: string) => Promise<boolean>;
		remove: (path: string) => Promise<void>;
		ensureFile: (path: string) => Promise<void>;
		writeTextFile: (path: string, content: string) => Promise<void>;
		readTextFile: (path: string) => Promise<string>;
		walk: (
			cwd: string,
			options: WalkOptions,
		) => AsyncIterableIterator<{ path: string; isFile: boolean }>;
	};
}

export type OptPath<TType extends { path: string }> = Omit<TType, "path"> & {
	path?: string;
};
/**
 * A function type for patching text files.
 * @template TContext The type of the CodeModContext.
 */
export type FilePatcher<TContext extends CodeModContext = CodeModContext> = (
	txt: TextFile,
	ctx: TContext,
) => Promise<OptPath<TextFile> | Delete> | (OptPath<TextFile> | Delete);

/**
 * Represents a JSON file.
 * @template T The type of the JSON content.
 */
export interface JSONFile<T = Record<string, unknown>> {
	content: T;
	path: string;
}

/**
 * A function type for patching JSON files.
 * @template TIn The type of the input JSON content.
 * @template TContext The type of the CodeModContext.
 * @template TOut The type of the output JSON content.
 */
export type JsonPatcher<
	TIn,
	TContext extends CodeModContext = CodeModContext,
	TOut = TIn,
> = (
	json: JSONFile<TIn>,
	ctx: TContext,
) =>
	| Promise<OptPath<JSONFile<TOut>> | Delete>
	| (OptPath<JSONFile<TOut>> | Delete);

/**
 * Represents a TypeScript file.
 */
export interface TsFile {
	content: SourceFile;
	path: string;
}

/**
 * A function type for patching TypeScript files.
 * @template TContext The type of the CodeModContext.
 */
export type TsPatcher<TContext extends CodeModContext = CodeModContext> = (
	text: TsFile,
	ctx: TContext,
) => Promise<OptPath<TsFile> | Delete> | (OptPath<TsFile> | Delete);

/**
 * Creates a FilePatcher for JSON files.
 * @template TIn The type of the input JSON content.
 * @template TOut The type of the output JSON content.
 * @template TContext The type of the CodeModContext.
 * @param {JsonPatcher<TIn, TContext, TOut>} f - The JSON patcher function.
 * @returns {FilePatcher<TContext>} A file patcher function.
 */
export const json =
	<TIn, TOut = TIn, TContext extends CodeModContext = CodeModContext>(
		f: JsonPatcher<TIn, TContext, TOut>,
	): FilePatcher<TContext> =>
	async ({ path, content }, ctx) => {
		const result = await f(
			{
				path,
				content: JSON.parse(content),
			},
			ctx,
		);

		if ("deleted" in result) {
			return result;
		}
		return {
			path: result.path,
			content: `${JSON.stringify(result.content, null, 2)}\n`,
		};
	};

/**
 * Creates a FilePatcher for TypeScript files.
 * @template TContext The type of the CodeModContext.
 * @param {TsPatcher<TContext>} f - The TypeScript patcher function.
 * @returns {FilePatcher<TContext>} A file patcher function.
 */
export const ts =
	<TContext extends CodeModContext = CodeModContext>(
		f: TsPatcher<TContext>,
	): FilePatcher<TContext> =>
	async (txt, ctx) => {
		const project = new Project();
		const sourceFile = project.addSourceFileAtPath(txt.path);
		const prev = sourceFile.print();
		const out = await f({ content: sourceFile, path: txt.path }, ctx);
		if ("deleted" in out) {
			return out;
		}
		if (prev === out.content.print()) {
			return {
				path: out.path,
				content: txt.content,
			};
		}
		return {
			path: out.path,
			content: out.content.print(),
		};
	};

/**
 * A map of symbols and their module specifiers.
 * @typedef {Record<string, Record<string, { moduleSpecifier: string; isTypeOnly?: boolean }>>} SymbolMap
 */
export type SymbolMap = Record<
	string,
	Record<
		string,
		{ moduleSpecifier: string; isTypeOnly?: boolean; name?: string }
	>
>;

/**
 * Rewrites import statements in TypeScript files based on a symbol map.
 * @param {SymbolMap} symbolMap - A map of symbols to rewrite.
 * @returns {FilePatcher<CodeModContext>} A file patcher function for rewriting imports.
 */
export const rewriteImport = (symbolMap: SymbolMap): FilePatcher =>
	ts(({ content: sourceFile, path }) => {
		const importDeclarations = sourceFile.getImportDeclarations();
		const newImports: Record<string, ImportDeclarationStructure> = {};

		importDeclarations.forEach((importDecl) => {
			const moduleSpecifier = importDecl.getModuleSpecifierValue();
			const namedImports = importDecl.getNamedImports();
			const symbolMapForModule = symbolMap[moduleSpecifier];

			if (symbolMapForModule) {
				namedImports.forEach((namedImport) => {
					const name = namedImport.getName();
					const alias = namedImport.getAliasNode()?.getText();
					const isTypeOnly = namedImport.isTypeOnly();
					const rewriter = symbolMapForModule[name];
					if (rewriter) {
						const {
							moduleSpecifier: newModuleSpecifier,
							isTypeOnly: newIsTypeOnly,
						} = rewriter;
						namedImport.remove();
						if (!newImports[newModuleSpecifier]) {
							newImports[newModuleSpecifier] = {
								kind: StructureKind.ImportDeclaration,
								moduleSpecifier: newModuleSpecifier,
								namedImports: [],
							};
						}
						const namedImports = newImports[newModuleSpecifier].namedImports;
						if (Array.isArray(namedImports)) {
							// this avoids breaking change when referencing the same symbol multiple times
							const nameAsAlias =
								typeof rewriter.name !== "undefined" ? name : undefined;
							namedImports.push({
								name: rewriter.name ?? name,
								alias: alias ?? nameAsAlias,
								isTypeOnly: newIsTypeOnly ?? isTypeOnly,
							});
						}
					}
				});
				if (importDecl.getNamedImports().length === 0) {
					importDecl.remove();
				}
			}
		});

		Object.values(newImports).forEach((importStructure) => {
			sourceFile.addImportDeclaration(importStructure);
		});

		return {
			content: sourceFile,
			path,
		};
	});

/**
 * Creates a CodeModTarget for rewriting imports in TypeScript files.
 * @template TContext The type of the CodeModContext.
 * @param {SymbolMap} symbolMap - A map of symbols to rewrite.
 * @returns {CodeModTarget<TContext>} A CodeModTarget object.
 */
export const rewriteImports = <
	TContext extends CodeModContext = CodeModContext,
>(
	symbolMap: SymbolMap,
): CodeModTarget<TContext> => {
	return {
		options: {
			match: [/.ts(x?)$/],
			skip: [/node_modules/, /.git/],
			includeDirs: false,
		},
		apply: rewriteImport(symbolMap),
	};
};

/**
 * Represents a code modification.
 * @template TContext The type of the CodeModContext.
 */
export interface CodeMod<TContext extends CodeModContext = CodeModContext> {
	patches: FileMod[];
	name?: string;
	description?: string;
	ctx: TContext;
	// if it should prompt user a confirmation prompt.
	yPrompt?: boolean;
}

/**
 * Applies a file patch.
 * @param {FileMod} p - The file modification.
 * @param {CodeModContext} ctx - The code modification context.
 * @returns {Promise<void>} A promise that resolves when the patch is applied.
 */
const applyPatch = async (p: FileMod, ctx: CodeModContext): Promise<void> => {
	if (isDelete(p)) {
		await ctx.fs.remove(p.from.path).catch(() => {});
	} else {
		if (isPatch(p)) {
			if (p.from.path !== p.to.path) {
				await ctx.fs.remove(p.from.path).catch(() => {});
			} else if (p.from.content === p.to.content) {
				return;
			}
		}
		await ctx.fs.ensureFile(p.to.path);
		await ctx.fs.writeTextFile(p.to.path, p.to.content);
	}
};

async function* defaultWalk(cwd: string, options: WalkOptions) {
	// Strict Bun-only: use Bun.Glob (native) to enumerate files.
	const entries: string[] = [];
	const glob = new Glob("**/*");
	for await (const entry of glob.scan(cwd)) {
		entries.push(path.resolve(cwd, entry));
	}

	// Normalize order for deterministic iteration
	entries.sort();
	for (const entry of entries) {
		const rel = entry;
		const skip = options?.skip?.some((r) => r.test(rel));
		if (skip) continue;
		const match = options?.match?.some((r) => r.test(rel));
		if (options?.match && !match) continue;
		const stat = await fs.stat(entry).catch(() => null);
		const isFile = stat ? stat.isFile() : false;
		if (!options?.includeDirs && !isFile) continue;
		yield { path: rel, isFile };
	}
}

type WalkOptions = {
	match?: RegExp[];
	skip?: RegExp[];
	includeDirs?: boolean;
};

const DEFAULT_FS: CodeModContext["fs"] = {
	cwd: () => process.cwd(),
	remove: async (p: string) => {
		await fs.rm(p, { recursive: true, force: true }).catch(() => {});
	},
	ensureFile: async (p: string) => {
		// Ensure parent directory exists
		const dir = path.dirname(p);
		await fs.mkdir(dir, { recursive: true }).catch(() => {});
		// Create the file if it doesn't exist (open with 'a' creates it)
		try {
			const handle = await fs.open(p, "a");
			await handle.close();
		} catch {
			// ignore errors
		}
	},
	writeTextFile: async (p: string, content: string) => {
		await fs.writeFile(p, content, "utf8");
	},
	readTextFile: async (p: string) => {
		return fs.readFile(p, "utf8");
	},
	walk: defaultWalk,
	exists: async (p: string) => {
		try {
			await fs.stat(p);
			return true;
		} catch {
			return false;
		}
	},
};

/**
 * Represents the default CodeModContext.
 */
export type DefaultCodeModContext = Omit<CodeModContext, "fs"> & {
	fs?: CodeModContext["fs"];
};

/**
 * Applies a code modification with the provided options.
 * @template TContext The type of the CodeModContext.
 * @param {CodeModOptions<TContext>} options - The code modification options.
 * @returns {Promise<void>} A promise that resolves when the code modification is applied.
 */
export const codeMod = async <
	TContext extends DefaultCodeModContext = DefaultCodeModContext,
>({
	name,
	description,
	targets,
	context,
	yPrompt,
}: CodeModOptions<TContext>): Promise<void> => {
	const patches: FileMod[] = [];
	const ctx = { fs: DEFAULT_FS, ...context };
	const fsNext: Record<string, string> = {};
	const readTextFile = ctx.fs.readTextFile.bind(ctx.fs);
	ctx.fs.readTextFile = async (path: string) =>
		fsNext[path] ?? (await readTextFile(path));
	const exists = ctx.fs.exists.bind(ctx.fs);

	ctx.fs.exists = async (path: string) => {
		return path in fsNext || (await exists(path));
	};

	for (const target of targets) {
		for await (const file of ctx.fs.walk(
			ctx.fs.cwd(),
			target.options as WalkOptions,
		)) {
			if (file.isFile) {
				const from = {
					content: fsNext[file.path] ?? (await ctx.fs.readTextFile(file.path)),
					path: file.path,
				};
				const to = await target.apply(from, ctx as TContext & CodeModContext);
				if ("deleted" in to) {
					fsNext[file.path] = "";
				} else {
					to.path ??= from.path;
					fsNext[from.path] = "";
					fsNext[to.path] = to.content;
				}
				patches.push({ from, to } as FileMod);
			}
		}
	}
	await applyCodeMod({ name, description, patches, ctx, yPrompt });
};

const promptConfirm = async (question: string) => {
	const readline = await import("node:readline");
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	return new Promise<boolean>((resolve) => {
		rl.question(`${question} (y/N) `, (ans: string) => {
			rl.close();
			resolve(ans.trim().toLowerCase().startsWith("y"));
		});
	});
};

/**
 * Applies a code modification.
 * @param {CodeMod} mod - The code modification.
 * @returns {Promise<void>} A promise that resolves when the code modification is applied.
 */
const applyCodeMod = async ({
	patches,
	name,
	description,
	ctx,
	yPrompt,
}: CodeMod) => {
	const args = process.argv.slice(2);
	const yesToAll = !yPrompt || Boolean(args.find((x) => x === "--y"));
	for (const patch of patches) {
		if (isDelete(patch)) {
			console.log(`🚨 ${red(patch.from.path)} will be deleted.`);
			continue;
		}

		const { content, path: fromPath } = isPatch(patch)
			? patch.from
			: { content: "", path: "" };

		if (content === patch.to.content && fromPath === patch.to.path) {
			continue;
		}

		const prettyPath = fromPath.replaceAll(ctx.fs.cwd(), ".");

		const linesDiff = diff.diffLines(
			content,
			await format(patch.to.content).catch(() => patch.to.content),
		);

		if (linesDiff.length === 1 && fromPath === patch.to.path) {
			const change = linesDiff[0].added ? "(new file)" : undefined;
			if (change) {
				console.log(gray(`✅ ${prettyPath} ${change}`));
			}
			continue;
		}

		console.log(
			`⚠️  ${yellow(prettyPath)} -> ${yellow(
				patch.to.path.replaceAll(ctx.fs.cwd(), "."),
			)}`,
		);

		if (yesToAll) continue;

		for (const { added, removed, value } of linesDiff) {
			const color = added ? green : removed ? red : gray;
			console.log(color(value));
		}
	}

	description && console.log(`These changes ${description}`);
	const ok = yesToAll || (await promptConfirm("Do you want to proceed?"));
	if (!ok) return;

	name && console.log(`Applying patch ${name}`);
	for (const patch of patches) {
		await applyPatch(patch, ctx);
	}
};

/**
 * Represents a target for applying a code modification.
 * @template TContext The type of the CodeModContext.
 */
export interface CodeModTarget<
	TContext extends CodeModContext = CodeModContext,
> {
	options: WalkOptions;
	apply: FilePatcher<TContext>;
}

/**
 * Represents options for applying code modifications.
 * @template TContext The type of the CodeModContext.
 */
export interface CodeModOptions<
	TContext extends DefaultCodeModContext = DefaultCodeModContext,
> {
	name?: string;
	description?: string;
	context?: TContext;
	targets: CodeModTarget<TContext & CodeModContext>[];
	// if it should prompt user a confirmation prompt.
	yPrompt?: boolean;
}
