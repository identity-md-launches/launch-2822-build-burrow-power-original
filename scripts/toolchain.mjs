// Normal npm installs resolve locally. An optional external toolchain lets restricted
// contributors build without creating a node_modules directory in the source tree.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const dependencyRoot = process.env.BURROW_TOOLCHAIN;
export const requireTool = createRequire(
  dependencyRoot
    ? resolve(dependencyRoot, "../package.json")
    : new URL("../package.json", import.meta.url),
);
export async function loadTool(name) {
  return import(pathToFileURL(requireTool.resolve(name)).href);
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === new URL(import.meta.url).pathname
) {
  const task = process.argv[2];
  if (task === "typecheck") {
    const ts = requireTool("typescript");
    const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
    const extra = dependencyRoot
      ? {
          typeRoots: [resolve(dependencyRoot, "@types")],
          baseUrl: process.cwd(),
          paths: {
            react: [resolve(dependencyRoot, "@types/react")],
            "react/*": [resolve(dependencyRoot, "@types/react/*")],
            "react-dom/*": [resolve(dependencyRoot, "@types/react-dom/*")],
          },
        }
      : {};
    const parsed = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      process.cwd(),
      extra,
    );
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const diagnostics = [
      ...parsed.errors,
      ...ts.getPreEmitDiagnostics(program),
    ];
    if (diagnostics.length)
      console.error(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCurrentDirectory: () => process.cwd(),
          getCanonicalFileName: (x) => x,
          getNewLine: () => "\n",
        }),
      );
    process.exitCode = diagnostics.length ? 1 : 0;
    if (!diagnostics.length) console.log("Typecheck passed.");
  } else if (task === "test") {
    const cli = requireTool.resolve("tsx/cli");
    const result = spawnSync(
      process.execPath,
      [cli, "--test", "tests/*.test.ts"],
      { stdio: "inherit", env: process.env },
    );
    process.exitCode = result.status ?? 1;
  } else {
    const vite = await loadTool("vite");
    const config = {
      configFile: false,
      base: "./",
      esbuild: { jsx: "automatic" },
      resolve: dependencyRoot
        ? {
            alias: [
              {
                find: /^react-dom(\/.*)?$/,
                replacement: resolve(dependencyRoot, "react-dom") + "$1",
              },
              {
                find: /^react(\/.*)?$/,
                replacement: resolve(dependencyRoot, "react") + "$1",
              },
            ],
          }
        : undefined,
    };
    if (task === "build") await vite.build(config);
    else if (task === "preview") {
      const server = await vite.preview({
        ...config,
        preview: { host: "0.0.0.0" },
      });
      server.printUrls();
    } else if (task === "dev") {
      const server = await vite.createServer({
        ...config,
        server: { host: "0.0.0.0" },
      });
      await server.listen();
      server.printUrls();
    } else throw new Error("Use dev, build, preview, typecheck or test.");
  }
}
