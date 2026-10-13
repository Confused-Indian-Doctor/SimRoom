import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createSession,
  applyCommand,
  elapsed,
  values,
  monitorState,
  validateScenario,
} from "../functions/engine.js";
const cases = JSON.parse(fs.readFileSync("functions/content/scenarios.json"));
let n = 0;
const command = (s, type, data = {}, at = 1000) =>
  applyCommand(s, { id: `test-${++n}`, type, ...data }, at);
test("all twelve source stage profiles match the development brief", () => {
  const expected = [
    [
      [18, 95, 96, 156, 88, 37.2],
      [20, 95, 100, 136, 78, 37.2],
      [28, 84, 120, 116, 76, 37.2],
      [22, 96, 102, 120, 74, 37.2],
    ],
    [
      [20, 93, 100, 123, 80, 36.2],
      [18, 96, 100, 120, 70, 36.4],
      [26, 80, 130, 90, 60, 36.3],
      [30, 84, 135, 85, 55, 36.3],
    ],
    [
      [22, 92, 110, 120, 80, 37.2],
      [24, 90, 122, 110, 70, 37.2],
      [32, 86, 135, 85, 55, 37.2],
      [32, 86, 135, 85, 55, 37.2],
    ],
  ];
  cases.forEach((c, j) =>
    c.stages.forEach((stage, i) => {
      assert.deepEqual(
        ["rr", "spo2", "hr", "sbp", "dbp", "temp"].map(
          (k) => stage.observations[k],
        ),
        expected[j][i],
      );
      assert.equal(stage.rhythm, null);
      assert.equal(stage.transition, null);
    }),
  );
});
test("PE help call and SBAR do not normalise physiology", () => {
  let s = createSession(cases[2], "owner", 0);
  s = command(s, "stage", { stage: 2 });
  const before = s.observations;
  for (const a of s.scenario.stages
    .flatMap((x) => x.actions)
    .filter((a) => /2222|SBAR/.test(a.text)))
    s = command(s, "action", { action: a.id, answer: "yes" });
  assert.deepEqual(s.observations, before);
});
test("Not yet, prompt, recognition and performed intervention stay distinct", () => {
  let s = createSession(cases[1], "owner", 0);
  const recognition = s.scenario.stages[2].actions.find((a) =>
    /decompression/.test(a.text),
  );
  const performed = s.scenario.stages[3].actions.find((a) =>
    /decompression/.test(a.text),
  );
  s = command(s, "action", { action: recognition.id, answer: "notyet" });
  assert.equal(s.actions[recognition.id], "notyet");
  s = command(s, "prompt", { action: recognition.id });
  assert.equal(s.actions[recognition.id], "notyet");
  s = command(s, "action", { action: recognition.id, answer: "yes" });
  assert.equal(s.actions[performed.id], undefined);
  assert.deepEqual(s.observations, cases[1].stages[0].observations);
});
test("overrides and oxygen remain pinned across stages", () => {
  let s = createSession(cases[0], "owner", 0);
  s = command(s, "override", { field: "spo2", value: 91 });
  s = command(s, "oxygen", { value: "Non-rebreather at 15 L/min" });
  s = command(s, "stage", { stage: 2 });
  assert.equal(s.observations.spo2, 91);
  assert.equal(s.oxygen, "Non-rebreather at 15 L/min");
  s = command(s, "unpin", { field: "spo2" });
  assert.equal(s.observations.spo2, 84);
});
test("pause/resume and retries preserve authoritative time and idempotence", () => {
  let s = createSession(cases[0], "owner", 0);
  s = command(s, "start", {}, 1000);
  s = command(s, "pause", {}, 6000);
  assert.equal(elapsed(s, 20000), 5000);
  s = command(s, "resume", {}, 20000);
  assert.equal(elapsed(s, 23000), 8000);
  const c = { id: "repeat", type: "note", text: "test" };
  s = applyCommand(s, c, 23000);
  const again = applyCommand(s, c, 25000);
  assert.deepEqual(again, s);
});
test("gradual playback freezes on pause and preserves pins", () => {
  let s = createSession(cases[0], "owner", 0);
  s = command(s, "start", {}, 0);
  s = command(s, "override", { field: "hr", value: 80 }, 0);
  s = command(s, "stage", { stage: 2, duration: 10000 }, 0);
  assert.equal(values(s, 5000).spo2, 89.5);
  assert.equal(values(s, 5000).hr, 80);
  s = command(s, "pause", {}, 5000);
  assert.deepEqual(values(s, 60000), values(s, 5000));
});
test("monitor payload excludes diagnosis, faculty history and expected actions", () => {
  const p = monitorState(createSession(cases[0], "owner", 0), 0);
  for (const key of [
    "scenario",
    "history",
    "events",
    "actions",
    "owner",
    "code",
    "stage",
  ])
    assert.equal(key in p, false);
  assert.equal(JSON.stringify(p).includes("STEMI"), false);
});
test("absent investigation cannot be released and early requests are allowed", () => {
  let s = createSession(cases[0], "owner", 0);
  s = command(s, "investigation", { investigation: "ecg", state: "requested" });
  assert.equal(s.investigations.ecg.requested, true);
  assert.throws(
    () =>
      command(s, "investigation", { investigation: "ecg", state: "released" }),
    /asset/,
  );
});
test("reviewed guided conditions support early unordered actions and confirmation", () => {
  const c = structuredClone(cases[0]);
  const a = c.stages[0].actions[0].id;
  c.stages[0].transition = {
    reviewed: true,
    combination: "all",
    actions: [a],
    requireConfirmation: true,
  };
  let s = createSession(c, "owner", 0);
  s = command(s, "mode", { value: "guided" });
  s = command(s, "start");
  s = command(s, "action", { action: a, answer: "yes" });
  assert.equal(s.stage, 0);
  s = command(s, "confirm");
  assert.equal(s.stage, 1);
});
test("running session keeps starting version and reset retains audit trail", () => {
  const c = structuredClone(cases[0]);
  let s = createSession(c, "owner", 0);
  c.version = 9;
  c.stages[0].observations.hr = 200;
  assert.equal(s.scenario.version, 1);
  assert.equal(s.observations.hr, 96);
  s = command(s, "note", { text: "Before reset" });
  s = command(s, "reset");
  assert.equal(s.events.length, 2);
  assert.equal(s.status, "ready");
});

test("reviewed responses apply to current gradual values and respect pins", () => {
  const c = structuredClone(cases[0]);
  const a = c.stages[0].actions[0];
  a.response = { reviewed: true, observations: { hr: 110, spo2: 98 } };
  let s = createSession(c, "owner", 0);
  s = command(s, "start", {}, 0);
  s = command(s, "override", { field: "hr", value: 80 }, 0);
  s = command(s, "stage", { stage: 2, duration: 10000 }, 0);
  s = command(s, "action", { action: a.id, answer: "yes" }, 5000);
  assert.equal(s.observations.hr, 80);
  assert.equal(s.observations.spo2, 98);
  assert.equal(values(s, 5000).sbp, 136);
  assert.equal(values(s, 10000).sbp, 116);
  assert.equal(values(s, 10000).spo2, 98);
});
test("stage changes reject invalid duration and preserve already-applied oxygen", () => {
  let s = createSession(cases[0], "owner", 0);
  assert.throws(
    () => command(s, "stage", { stage: 1, duration: -1 }),
    /duration/,
  );
  s = command(s, "stage", { stage: 3 });
  s = command(s, "stage", { stage: 2 });
  assert.equal(s.oxygen, "Room air");
  s = command(s, "stage", { stage: 3 });
  s = command(s, "oxygenScenario");
  assert.equal(s.oxygen, "On oxygen; flow unspecified");
  s = command(s, "stage", { stage: 2 });
  assert.equal(s.oxygen, "On oxygen; flow unspecified");
  s = command(s, "oxygenScenario");
  assert.equal(s.oxygen, "Room air");
});

test("scenario authoring rejects malformed responses and transitions", () => {
  for (const c of cases) assert.equal(validateScenario(c), c);
  let c = structuredClone(cases[0]);
  c.stages[0].transition = { reviewed: true, combination: "all" };
  assert.throws(() => validateScenario(c), /condition/);
  c = structuredClone(cases[0]);
  c.stages[0].actions[0].response = {
    reviewed: true,
    observations: { hr: "100" },
  };
  assert.throws(() => validateScenario(c), /observations/);
  c = structuredClone(cases[0]);
  c.investigations[0].assetPath = "public/diagnosis.png";
  assert.throws(() => validateScenario(c), /private/);
});
test("faculty cue is distinct from notes and does not change physiology", () => {
  let s = createSession(cases[0], "owner", 0);
  s = command(s, "cue", { text: "Prompt for analgesia" });
  assert.equal(s.events[0].type, "cue");
  assert.deepEqual(s.observations, cases[0].stages[0].observations);
});

test("pinning and returning one field leaves other gradual changes running", () => {
  let s = createSession(cases[0], "owner", 0);
  s = command(s, "start", {}, 0);
  s = command(s, "stage", { stage: 2, duration: 10000 }, 0);
  s = command(s, "override", { field: "hr", value: 80 }, 4000);
  assert.equal(values(s, 5000).hr, 80);
  assert.equal(values(s, 5000).spo2, 89.5);
  s = command(s, "unpin", { field: "hr" }, 6000);
  assert.equal(values(s, 6000).hr, 120);
  assert.equal(values(s, 8000).spo2, 86.2);
  assert.equal(values(s, 10000).sbp, 116);
});

test('monitor projection strips unrecognised nested observation metadata',()=>{const s=createSession(cases[0],'owner',0);s.observations.diagnosis='PRIVATE';s.pins.expectedAnswer=true;const p=monitorState(s,0);assert.equal(p.observations.diagnosis,undefined);assert.equal(p.pins.expectedAnswer,undefined);const c=structuredClone(cases[0]);c.stages[0].observations.diagnosis='PRIVATE';assert.throws(()=>validateScenario(c),/Unsupported/)});
