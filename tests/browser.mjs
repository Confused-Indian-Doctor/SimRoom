// Requires seeded, running Firebase emulators. Starts Vite for browser acceptance.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    ...(process.env.SIMROOM_PRODUCTION ? ["preview", "--outDir", "dist-emulator"] : []),
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
const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
  }),
  display = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  });
const control = await phone.newPage(),
  monitor = await display.newPage();
control.setDefaultTimeout(60000);monitor.setDefaultTimeout(60000);
async function waitFor(condition) {
  for (let n = 0; n < 300; n++) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Timed out waiting for acceptance condition");
}
try {
  await waitFor(async () => {
    try {
      return (await fetch("http://127.0.0.1:5173")).ok;
    } catch {
      return false;
    }
  });
  await control.goto("http://127.0.0.1:5173");
  await control.getByLabel("Password", { exact: true }).fill("SimRoom123!");
  await control.getByRole("button", { name: "Sign in", exact: true }).click();
  await control
    .locator(".case-card")
    .filter({ hasText: "Pulmonary embolism" })
    .getByRole("button", { name: "Start session" })
    .click();
  await control.getByRole("button", { name: "Connect monitor" }).click();
  await waitFor(
    async () =>
      await control.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
  );
  const code = (await control.locator(".session-code").innerText()).trim();
  await monitor.goto(`http://127.0.0.1:5173/monitor?code=${code}`);
  await monitor.locator(".monitor").waitFor();
  assert.equal(
    (await monitor.locator(".numeric.cyan strong").innerText()).trim(),
    "92",
  );
  await control.getByRole("button", { name: "Control", exact: true }).click();
  await control.locator(".stage-buttons button").nth(2).click();
  await waitFor(
    async () =>
      (await monitor.locator(".numeric.cyan strong").innerText()) === "86",
  );
  const form = control
    .locator(".override-grid form")
    .filter({ hasText: "SPO2" });
  await form.locator("input").fill("91");
  await form.getByRole("button", { name: "Apply & pin" }).click();
  await control.locator(".stage-buttons button").nth(3).click();
  await waitFor(
    async () =>
      (await monitor.locator(".numeric.cyan strong").innerText()) === "91",
  );
  await control.getByRole("button", { name: "Start", exact: true }).click();
  await control.getByRole("button", { name: "Actions", exact: true }).click();
  const sbar = control
    .locator(".action-card")
    .filter({ hasText: "Deliver SBAR handover" });
  await sbar.getByRole("button", { name: "Not yet", exact: true }).click();
  await sbar
    .getByRole("button", { name: "Prompt given", exact: true })
    .click();
  await sbar.getByRole("button", { name: "Yes", exact: true }).click();
  assert.equal(await monitor.locator(".numeric.cyan strong").innerText(), "91");
  await control.getByRole("button", { name: "Control", exact: true }).click();
  await control.getByRole("button", { name: "Pause", exact: true }).click();
  await waitFor(async () =>
    (await monitor.locator(".monitor-patient").innerText()).includes("PAUSED"),
  );
  await display.setOffline(true);
  await waitFor(async () =>
    (await monitor.locator(".status").innerText()).includes("STALE"),
  );
  await display.setOffline(false);
  await waitFor(async () =>
    (await monitor.locator(".status").innerText()).includes("LIVE CONNECTION"),
  );
  await control.getByRole("button", { name: "Resume", exact: true }).click();
  await waitFor(async () =>
    (await monitor.locator(".monitor-patient").innerText()).includes("RUNNING"),
  );
  await control.getByLabel('Device',{exact:true}).fill('Fixture oxygen device');
  await control.getByLabel('Flow (L/min; leave blank if unspecified)').fill('6');
  await control.getByLabel('Oxygen delivery · independent of SpO₂').fill('Fixture oxygen at 6 L/min');
  await control.getByRole('button',{name:'Apply & pin delivery',exact:true}).click();
  await control.locator('.stage-buttons button').nth(0).click();
  await waitFor(async()=> (await monitor.locator('.monitor-footer').innerText()).includes('Fixture oxygen device at 6 L/min'));
  await control.getByLabel('Assisted ventilation in progress').check();
  await control.getByLabel('Assisted rate (/min; leave blank if unspecified)').fill('12');
  await control.getByRole('button',{name:'Record ventilation',exact:true}).click();
  await waitFor(async()=> (await monitor.locator('.monitor-footer').innerText()).includes('Assisted ventilation · 12/min'));
  assert.equal(await monitor.locator('.numeric.yellow strong').innerText(),'22');
  await control.getByRole('button',{name:'History',exact:true}).click();await control.getByRole('heading',{name:'Patient history',exact:true}).waitFor();
  await control.getByRole('button',{name:'Findings',exact:true}).click();await control.getByRole('heading',{name:'Examination',exact:true}).waitFor();
  await control.getByRole('button',{name:'Investigations',exact:true}).click();await control.getByRole('heading',{name:'Investigations',exact:true}).waitFor();
  await control.getByRole('button',{name:'Briefing',exact:true}).click();await control.getByRole('heading',{name:'Patient briefing',exact:true}).waitFor();
  await control.getByRole('button',{name:'Checklist',exact:true}).click();await control.locator('.action-card').first().waitFor();
  for(const width of [375,390,430]){await control.setViewportSize({width,height:844});assert(await control.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await control.getByRole('button',{name:'Control',exact:true}).click();
  await fs.mkdir("docs/screenshots", { recursive: true });
  await control.screenshot({
    path: "docs/screenshots/controller.png",
    fullPage: true,
  });
  await monitor.screenshot({
    path: "docs/screenshots/monitor.png",
    fullPage: true,
  });
  await control.getByRole("button", { name: "Actions", exact: true }).click();
  await control.screenshot({
    path: "docs/screenshots/actions.png",
    fullPage: true,
  });
  await control.getByRole("button", { name: "Control", exact: true }).click();
  await control
    .locator(".panel")
    .filter({ hasText: "Monitor rhythm" })
    .locator("select")
    .selectOption("sinus");
  await waitFor(async () =>
    (await monitor.locator(".trace-label.green").innerText()).includes("SINUS"),
  );
  await monitor.screenshot({
    path: "docs/screenshots/monitor.png",
    fullPage: true,
  });
  await monitor.getByRole("button", { name: "Sound off" }).click();
  await monitor.getByRole("button", { name: "Sound on" }).click();
  if (process.env.SIMROOM_PRODUCTION) {
    await monitor.evaluate(() => navigator.serviceWorker.ready);
    await waitFor(
      async () =>
        await monitor.evaluate(
          () => navigator.serviceWorker.controller !== null,
        ),
    );
    const manifest = await monitor.evaluate(
      async () => await (await fetch("/manifest.webmanifest")).json(),
    );
    assert.equal(manifest.display, "standalone");
    await display.setOffline(true);
    await monitor.reload();
    await monitor
      .getByRole("heading", { name: "Join a patient monitor" })
      .waitFor();
    await display.setOffline(false);
  }
  await control
    .getByRole("button", { name: "View debrief", exact: true })
    .click();
  await control.screenshot({
    path: "docs/screenshots/debrief.png",
    fullPage: true,
  });
  await control
    .getByRole("button", { name: "Scenario library", exact: true })
    .click();
  await control.screenshot({
    path: "docs/screenshots/library-phone.png",
    fullPage: true,
  });
  await control.setViewportSize({ width: 1366, height: 900 });
  await control.screenshot({
    path: "docs/screenshots/library.png",
    fullPage: true,
  });
  if(process.env.SIMROOM_PACK_BROWSER || await control.locator('.case-card').filter({hasText:'Nonclinical phone fixture'}).count()){
    await control.setViewportSize({width:390,height:844});control.on('dialog',dialog=>void dialog.accept());
    await control.locator('.case-card').filter({hasText:'Nonclinical phone fixture'}).getByRole('button',{name:'Start session',exact:true}).click();
    await control.getByRole('button',{name:'Connect monitor',exact:true}).click();const fixtureCode=(await control.locator('.session-code').innerText()).trim();
    await monitor.goto(`http://127.0.0.1:5173/monitor?code=${fixtureCode}`);await monitor.locator('.monitor').waitFor();
    await control.getByRole('button',{name:'prescribed',exact:true}).click();
    await waitFor(async()=>await control.getByRole('button',{name:'✓ prescribed',exact:true}).isDisabled());
    assert.equal(await monitor.locator('.numeric.yellow strong').innerText(),'22');
    await control.getByRole('button',{name:'performed',exact:true}).click();
    await control.getByRole('button',{name:'Confirm effective',exact:true}).click();
    await control.getByRole('button',{name:'Control',exact:true}).click();await control.getByRole('button',{name:'Select branch',exact:true}).click();
    await waitFor(async()=>(await monitor.locator('.numeric.yellow strong').innerText())==='11');
    await control.getByRole('button',{name:'Start',exact:true}).click();await control.getByRole('button',{name:'Pause',exact:true}).click();
    await control.getByRole('button',{name:'Fixture thirty-minute jump · +30 min',exact:true}).click();
    await waitFor(async()=>(await monitor.locator('.monitor-patient').innerText()).includes('30:'));
    assert((await monitor.locator('.monitor-patient').innerText()).includes('PAUSED'));
    await control.getByRole('button',{name:'Debrief',exact:true}).click();await control.getByRole('heading',{name:'Discussion questions',exact:true}).waitFor();
    await control.screenshot({path:'docs/screenshots/pack-fixture-debrief.png',fullPage:true});
    console.log('PASS nonclinical pack UI fixture: separate delivery/effectiveness, confirmed branch, explicit paused time jump and private debrief sections.');
  }
  console.log(
    `${process.env.SIMROOM_PRODUCTION ? "PRODUCTION PWA: worker, manifest and offline app shell passed. " : ""}PASS separate browser contexts: joining, live stages, pins, SBAR recording, prompt, pause/resume and offline/reconnect. Screenshots captured. Physical devices remain untested.`,
  );
} catch(error) {
  await control.screenshot({path:"docs/screenshots/browser-failure.png",fullPage:true}).catch(()=>{});
  console.log("Browser failure state:",await control.locator(".global-error").allTextContents());
  throw error;
} finally {
  await phone.close();
  await display.close();
  await browser.close();
  server.kill("SIGTERM");
}
