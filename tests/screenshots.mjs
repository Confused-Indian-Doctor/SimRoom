import { chromium } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--outDir",
    "dist-emulator",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
  ],
  { stdio: "inherit" },
);
const browser = await chromium.launch({
  executablePath: process.env.SIMROOM_CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
});
const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  }),
  page = await context.newPage();
try {
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch("http://127.0.0.1:5173")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  await page.goto("http://127.0.0.1:5173");
  await page.getByLabel("Password", { exact: true }).fill("SimRoom123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.locator(".case-card").first().waitFor();
  assert.equal(
    await page.locator(".case-card").first().locator("h3").innerText(),
    "Anterior STEMI",
  );
  await page.screenshot({
    path: "docs/screenshots/library.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/library-phone.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page
    .locator(".case-card")
    .filter({ hasText: "Tension pneumothorax" })
    .getByRole("button", { name: "Start session" })
    .click();
  await page.getByRole("button", { name: "Patient", exact: true }).click();
  await page.locator(".source-text").first().waitFor();
  assert.ok(
    (await page.locator(".source-text").first().innerText()).includes(
      "Semi-professional basketball player",
    ),
  );
  await page.screenshot({
    path: "docs/screenshots/patient-ptx.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page
    .getByRole("button", { name: "Scenario editor", exact: true })
    .click();
  await page.locator(".json-editor").waitFor();
  await page.screenshot({
    path: "docs/screenshots/editor.png",
    fullPage: true,
  });
  console.log(
    "PASS: original PTX history rendered privately, case ordering and phone width checked; production screenshots updated.",
  );
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
