// Reproduce the social card from the shipped, original SVG habitat artwork.
import { writeFile } from "node:fs/promises";
import { loadTool } from "./toolchain.mjs";
import { serveExport } from "./static-server.mjs";
const module = await loadTool("playwright"),
  { chromium } = module.default ?? module;
const server = await serveExport(),
  browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
  });
  await page.route("https://api.squeekchain.com/**", (r) => r.abort());
  await page.goto(server.url);
  const habitat = await page
    .locator(".habitat-art")
    .evaluate((el) => el.outerHTML);
  const mark = await page.locator(".brand>svg").evaluate((el) => el.outerHTML);
  const art = habitat.replace(
    "<svg ",
    '<svg x="560" y="85" width="620" height="430" ',
  );
  const logo = mark.replace("<svg ", '<svg x="64" y="58" ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><pattern id="share-dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r="1" fill="#2a4239"/></pattern></defs><rect width="1200" height="630" fill="#0c1515"/><rect width="1200" height="630" fill="url(#share-dots)"/><g color="#cff58b">${logo}</g><g font-family="Arial,sans-serif"><text x="112" y="83" font-size="22" fill="#b9c8b8">A Squeekchain survival game</text><text x="62" y="245" font-size="88" font-weight="700" letter-spacing="-4" fill="#f1f2e9">Burrow</text><text x="62" y="335" font-size="88" font-weight="700" letter-spacing="-4" fill="#cff58b">Power</text><text x="66" y="410" font-size="28" fill="#f1f2e9">Small paws. Big night.</text><text x="66" y="455" font-size="20" fill="#a8bbb3">Six encounters. One little home.</text><rect x="64" y="512" width="273" height="52" rx="10" fill="#cff58b"/><text x="87" y="546" font-size="20" font-weight="700" fill="#172017">Protect the burrow →</text><text x="1140" y="586" text-anchor="end" font-size="16" fill="#a8bbb3">Local game progress · No SQK rewards</text></g><rect x="560" y="100" width="612" height="410" rx="24" fill="#101d1b" stroke="#304743"/>${art}<style>.habitat-art text{font-family:Arial,sans-serif;font-size:24px;font-weight:600}</style></svg>`;
  await writeFile("public/share.svg", svg + "\n");
  await page.setContent(
    `<style>body{margin:0;background:#0c1515}svg{display:block}</style>${svg}`,
  );
  await page.screenshot({ path: "public/share.png", type: "png" });
  console.log(
    "Generated public/share.svg and 1200×630 public/share.png from the production habitat.",
  );
} finally {
  await browser.close();
  await server.close();
}
