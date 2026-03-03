import prettier from "prettier";

/**
 * format content using Prettier
 * @param content the string content
 * @returns the formatted content or the original content on error
 */
export async function format(content: string): Promise<string> {
  try {
    const config = await prettier.resolveConfig(process.cwd()).catch(() => null);
    return prettier.format(content, {
      parser: "typescript",
      ...(config ?? {}),
    });
  } catch (_err) {
    return content;
  }
}
