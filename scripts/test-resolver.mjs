/**
 * Minimal ESM resolver for the Node test scripts, so they can import the real
 * TypeScript modules from src/ (including the "@/..." path alias) without a build step.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs", ".json"];

const candidates = (basePath) => {
  const list = [];
  if (path.extname(basePath)) list.push(basePath);
  else {
    for (const extension of EXTENSIONS) list.push(`${basePath}${extension}`);
    for (const extension of EXTENSIONS) list.push(path.join(basePath, `index${extension}`));
  }
  return list;
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const basePath = path.join(SRC_DIR, specifier.slice(2));
    for (const candidate of candidates(basePath)) {
      try {
        return await nextResolve(pathToFileURL(candidate).href, context);
      } catch {
        continue;
      }
    }
  }

  if (specifier.startsWith(".") && context.parentURL) {
    const basePath = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    for (const candidate of candidates(basePath)) {
      try {
        return await nextResolve(pathToFileURL(candidate).href, context);
      } catch {
        continue;
      }
    }
  }

  return nextResolve(specifier, context);
}
