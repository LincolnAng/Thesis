// Lets `node --test` load the app's TypeScript the way Next does: "@/x" means src/x, and an
// import may leave off its .ts / .tsx extension. Registered by `npm test`.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      import { existsSync } from "node:fs";
      import { fileURLToPath, pathToFileURL } from "node:url";
      const SRC = ${JSON.stringify(new URL("../src/", import.meta.url).href)};
      const EXTS = ["", ".ts", ".tsx", "/index.ts"];
      export async function resolve(specifier, context, next) {
        let base = null;
        if (specifier.startsWith("@/")) base = new URL(specifier.slice(2), SRC).href;
        else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:"))
          base = new URL(specifier, context.parentURL).href;
        if (base) {
          for (const ext of EXTS) {
            const candidate = base + ext;
            const path = fileURLToPath(candidate);
            if (ext === "" && !/\\.(ts|tsx|js|mjs|json)$/.test(path)) continue;
            if (existsSync(path)) return next(pathToFileURL(path).href, context);
          }
        }
        return next(specifier, context);
      }
    `),
);
