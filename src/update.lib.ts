import * as colors from "kleur";
import { promises as fs } from "fs";
import path from "path";
import * as semver from "semver";
import type { DenoJSON } from "./denoJSON.ts";
import { pkgInfo } from "./pkg.ts";
import { lookup, REGISTRIES } from "./registry.ts";

// map of `packageAlias` to `packageRepo`
const PACKAGES_TO_CHECK =
  /(@deco\/.*)|(apps)|(deco)|(\$live)|(deco-sites\/.*\/\$)|(partytown)/;

const requiredMinVersion: Record<string, string> = {
  // "std/": "0.208.0",
};

const denoJSONFileNames = ["deno.json", "deno.jsonc"];
const getDenoJSONPath = async (cwd = process.cwd()) => {
  for (const importFileName of denoJSONFileNames) {
    const importMapPath = path.join(cwd, importFileName);
    try {
      const st = await fs.stat(importMapPath);
      if (st.isFile()) return importMapPath;
    } catch {
      // continue
    }
  }
  return undefined;
};
async function* getImportMaps(
  dir: string,
): AsyncIterableIterator<[DenoJSON, string]> {
  const denoJSONPath = await getDenoJSONPath(dir);
  if (!denoJSONPath) {
    throw new Error(`could not find deno.json definition in ${dir}`);
  }
  const denoJSON = await fs.readFile(denoJSONPath, "utf8").then(JSON.parse);
  // inlined import_map inside deno.json
  if (denoJSON.imports) {
    yield [denoJSON, denoJSONPath];
  } else {
    const importMapFile = denoJSON?.importMap ?? "./import_map.json";
    const importMapPath = path.join(dir, importMapFile.replace("./", ""));
    try {
      const st = await fs.stat(importMapPath);
      if (st.isFile()) {
        yield [
          await fs.readFile(importMapPath, "utf8").then(JSON.parse).catch(
            () => ({
              imports: {},
            }),
          ),
          importMapPath,
        ];
      }
    } catch {
      // ignore
    }
  }

  if (Array.isArray(denoJSON.workspace)) {
    for (const workspace of denoJSON.workspace as string[]) {
      yield* getImportMaps(path.join(dir, workspace));
    }
  }
}

/**
 * Upgrade dependencies in the import map (in place)
 * @param importMap the importmap (or deno.json) to upgrade
 * @param logs whether to log the upgrade process
 * @param packages a regex to filter which packages to upgrade
 * @returns a boolean indicating if any upgrades were made
 */
export async function upgradeDeps(
  importMap: DenoJSON,
  logs = true,
  deps = PACKAGES_TO_CHECK,
  logger = console.info,
): Promise<boolean> {
  let upgradeFound = false;
  logs && logger("looking up latest versions");

  importMap.imports ??= {};
  const imports = importMap.imports;
  await Promise.all(
    Object.keys(imports)
      .filter((pkg) => deps.test(pkg))
      .map(async (pkg) => {
        const info = await pkgInfo(
          imports[pkg],
          process.argv.includes("--allow-pre"),
        );

        if (!info?.versions?.latest) return;

        const {
          url,
          versions: {
            latest: latestVersion,
            current: currentVersion,
          },
        } = info;

        if (
          !semver.valid(currentVersion) &&
          !process.argv.includes("force")
        ) {
          logs && logger(
            colors.yellow(
              `skipping ${pkg} ${currentVersion} -> ${latestVersion}. Use --force to upgrade.`,
            ),
          );
          return;
        }

        if (currentVersion !== latestVersion) {
          logs && logger(
            `upgrading ${pkg} ${currentVersion} -> ${latestVersion}.`,
          );

          upgradeFound = true;
          imports[pkg] = url.at(latestVersion).url;
        }
      }),
  );

  for (const [pkg, minVer] of Object.entries(requiredMinVersion)) {
    if (imports[pkg]) {
      const url = lookup(imports[pkg], REGISTRIES);
      const currentVersion = url?.version();
      if (
        !currentVersion ||
        semver.lt(
          semver.coerce(currentVersion)!,
          semver.coerce(minVer)!,
        )
      ) {
        logs && logger(
          `upgrading ${pkg} ${currentVersion} -> ${minVer}.`,
        );

        upgradeFound = true;
        imports[pkg] = url?.at(minVer).url ??
          imports[pkg];
      }
    }
  }

  if (!upgradeFound) {
    logs &&
      logger(
        "dependencies are on the most recent releases of your dependencies!",
      );
  }
  return upgradeFound;
}

export async function* updatedImportMap(
  logs: boolean = true,
  cwd: string = process.cwd(),
): AsyncIterableIterator<[DenoJSON, string]> {
  for await (const [importMap, importMapPath] of getImportMaps(cwd)) {
    const logger = (...msg: unknown[]) =>
      console.info(
        colors.gray(`${importMapPath.replaceAll(process.cwd(), ".")}:`),
        ...msg,
      );
    const upgradeFound = await upgradeDeps(
      importMap,
      logs,
      PACKAGES_TO_CHECK,
      logger,
    );
    if (upgradeFound) {
      yield [importMap, importMapPath];
      logger(colors.green(`upgraded successfully`));
    }
  }
}

export async function update(
  cwd: string = process.cwd(),
) {
  for await (
    const [importMap, importMapPath] of updatedImportMap(true, cwd)
  ) {
    await fs.writeFile(
      importMapPath,
      `${JSON.stringify(importMap, null, 2)}\n`,
    );
  }
}

export { pkgInfo };
