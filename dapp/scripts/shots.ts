/**
 * Screenshots of pages for design review, with the Terms accepted the way
 * the journeys accept them: `bun scripts/shots.ts <out dir> <path>...`
 * against a running server (dev or the e2e build). Not a test.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const [out, ...paths] = process.argv.slice(2);
const { lastUpdated } = JSON.parse(
  readFileSync(
    new URL("../src/constants/terms-summary.json", import.meta.url),
    "utf8",
  ),
);
const browser = await chromium.launch();
for (const [name, width, height, theme] of [
  ["desktop", 1440, 900, "light"],
  ["phone", 390, 844, "light"],
  ["desktop-dark", 1440, 900, "dark"],
  ["phone-dark", 390, 844, "dark"],
] as const) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.addInitScript(
    ([version, mode]) => {
      localStorage.setItem("tansu_tos_accepted", JSON.stringify({ version }));
      if (mode !== "light") localStorage.setItem("tansu-theme", mode);
    },
    [lastUpdated, theme],
  );
  for (const path of paths) {
    await page
      .goto(`http://localhost:4321${path}`, { waitUntil: "networkidle" })
      .catch(() => {});
    await page.waitForTimeout(2500);
    const file = `${out}/${path.replace(/[^a-z0-9]+/gi, "_") || "home"}-${name}.png`;
    await page.screenshot({ path: file, fullPage: name.startsWith("desktop") });
    console.log(file);
  }
  await page.close();
}
await browser.close();
