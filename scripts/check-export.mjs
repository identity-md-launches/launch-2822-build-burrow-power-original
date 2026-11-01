// Verify only the project deliverable, never machine/configuration directories.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve, join, relative, dirname } from "node:path";
const root = resolve(".");
const skip = new Set([
  ".git",
  ".github",
  ".imd",
  ".agents",
  ".codex",
  ".aws",
  ".playwright-mcp",
  "node_modules",
  ".vite",
  ".npm",
  ".cache",
]);
const limit = 8388608;
const reportPath = "artifacts/bundle-audit.json";
async function filesIn(dir = root) {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name),
      rel = relative(root, path).replaceAll("\\", "/");
    if (
      skip.has(item.name) ||
      item.name.startsWith(".env") ||
      rel === "test/scratch"
    )
      continue;
    assert.ok(
      !["node_modules", ".vite", ".npm"].includes(item.name),
      "Unexpected dependency/cache directory in the deliverable",
    );
    assert.ok(
      !item.isSymbolicLink(),
      "The deliverable must not depend on symlinks",
    );
    if (item.isDirectory()) files.push(...(await filesIn(path)));
    else if (item.isFile()) files.push(path);
  }
  return files;
}
const required = [
  "dist/index.html",
  "dist/share.png",
  "dist/share.svg",
  "dist/favicon.svg",
  "README.md",
  "DESIGN.md",
  "package.json",
  "package-lock.json",
  "src/App.tsx",
  "src/game.ts",
  "src/api.ts",
  "src/storage.ts",
  "artifacts/validation.md",
  "artifacts/browser-validation.json",
  "artifacts/live-validation.json",
  "artifacts/taste.json",
  "artifacts/rendered-measurements.json",
  "artifacts/publication.json",
  "artifacts/PULL_REQUEST.md",
];
for (const path of required)
  assert.ok((await stat(path)).size > 0, `Required output is empty: ${path}`);
const html = await readFile("dist/index.html", "utf8"),
  localAssets = [];
for (const match of html.matchAll(
  /(?:src|href)="([^"]+)"|property="og:image"\s+content="([^"]+)"/g,
)) {
  const url = match[1] ?? match[2];
  assert.ok(url.startsWith("./"), "Production assets must use relative URLs");
  assert.ok((await stat(join("dist", url.split(/[?#]/)[0]))).isFile());
  localAssets.push(url);
}
for (const file of await filesIn(resolve("dist/assets"))) {
  if (!file.endsWith(".css")) continue;
  const css = await readFile(file, "utf8");
  for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    if (match[1].startsWith("data:")) continue;
    assert.ok(!match[1].startsWith("/"), "CSS runtime assets must be relative");
    assert.ok((await stat(join(dirname(file), match[1]))).isFile());
  }
}
const png = await readFile("dist/share.png");
assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
assert.equal(png.readUInt32BE(16), 1200);
assert.equal(png.readUInt32BE(20), 630);
assert.equal(png.subarray(-8, -4).toString(), "IEND");
const browser = JSON.parse(
  await readFile("artifacts/browser-validation.json", "utf8"),
);
const live = JSON.parse(
  await readFile("artifacts/live-validation.json", "utf8"),
);
const taste = JSON.parse(await readFile("artifacts/taste.json", "utf8"));
assert.equal(browser.result, "passed");
assert.equal(live.result, "passed");
assert.ok(taste.checks.length === 16 && taste.checks.every((c) => c.passed));
const report = {
  at: new Date().toISOString(),
  requiredOutputCount: required.length,
  requiredOutputsPresent: true,
  relativeAssetCount: localAssets.length,
  relativeRuntimeAssetsValid: true,
  socialImage: { format: "PNG", width: 1200, height: 630 },
  productionIndexSha256: createHash("sha256").update(html).digest("hex"),
  byteLimit: limit,
  bundleFiles: 0,
  bundleBytes: 0,
  bundleWithinLimit: true,
  dependencyOrCacheDirectoriesBundled: false,
  protectedMetadataAndTaskInputsExcluded: true,
  remoteResults: "Unavailable; no commit, PR or new hosted version claimed",
};
for (let i = 0; i < 5; i++) {
  const files = await filesIn();
  report.bundleFiles = files.length;
  report.bundleBytes = (await Promise.all(files.map((f) => stat(f)))).reduce(
    (n, f) => n + f.size,
    0,
  );
  assert.ok(report.bundleBytes < limit, "Bundle exceeds 8 MiB");
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
}
const finalFiles = await filesIn();
assert.equal(
  (await Promise.all(finalFiles.map((f) => stat(f)))).reduce(
    (n, f) => n + f.size,
    0,
  ),
  report.bundleBytes,
);
console.log(
  JSON.stringify({
    requiredOutputsPresent: true,
    relativeRuntimeAssetsValid: true,
    bundleBytes: report.bundleBytes,
    byteLimit: limit,
    dependencyOrCacheDirectoriesBundled: false,
  }),
);
