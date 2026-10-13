// Nonclinical engine fixtures: these are not authored patient cases or recovery profiles.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createSession,
  applyCommand,
  elapsed,
  monitorState,
  validateScenario,
} from "../functions/engine.js";
let count = 0;
const command = (s, type, data = {}, now = 1000) =>
  applyCommand(s, { id: "branch-test-" + ++count, type, ...data }, now);
function fixture() {
  const s = structuredClone(
    JSON.parse(fs.readFileSync("functions/content/scenarios.json"))[0],
  );
  s.id = "nonclinical-fixture";
  s.interventions = [{ id: "rescue", name: "Fixture delivered intervention" }];
  s.facultyPack = {
    originalText: "PRIVATE fixture",
    debriefQuestions: "PRIVATE question",
    exampleSBAR: "PRIVATE answer",
  };
  s.branches = [
    {
      id: "untreated",
      name: "Fixture untreated",
      kind: "deterioration",
      reviewed: true,
      provenance: "faculty-authored",
      sourceNote: "Nonclinical test data",
      automatic: true,
      conditions: {
        afterMs: 10000,
        clock: "session",
        unlessEffective: ["rescue"],
      },
      observations: { rr: 2, spo2: 98 },
    },
    {
      id: "treated",
      name: "Fixture treated",
      kind: "recovery",
      reviewed: true,
      provenance: "faculty-authored",
      sourceNote: "Nonclinical test data",
      conditions: { interventions: [{ id: "rescue", state: "effective" }] },
      observations: { rr: 12 },
    },
    {
      id: "recurrence",
      name: "Fixture recurrence",
      kind: "deterioration",
      reviewed: true,
      provenance: "faculty-authored",
      sourceNote: "Nonclinical test data",
      automatic: true,
      conditions: {
        fromBranches: ["treated"],
        afterMs: 1800000,
        clock: "branch",
      },
      observations: { rr: 3 },
    },
  ];
  s.timeJumps = [
    {
      id: "30min",
      label: "Fixture thirty-minute teaching jump",
      advanceMs: 1800000,
      reviewed: true,
    },
  ];
  s.investigations[0] = {
    ...s.investigations[0],
    report:
      "Supplied synthetic text fixture: 12-lead report. Not a diagnostic image.",
    releaseOnRequest: true,
  };
  return validateScenario(s);
}
test("prescription, help calls and delivery never imply clinical effectiveness", () => {
  let s = createSession(fixture(), "owner", 0),
    before = s.observations;
  for (const state of ["requested", "prescribed"])
    s = command(s, "intervention", { intervention: "rescue", state });
  assert.deepEqual(s.observations, before);
  assert.throws(
    () =>
      command(s, "intervention", {
        intervention: "rescue",
        state: "effective",
        confirmed: true,
      }),
    /after delivery/,
  );
  s = command(s, "intervention", {
    intervention: "rescue",
    state: "administered",
  });
  assert.throws(
    () =>
      command(s, "intervention", {
        intervention: "rescue",
        state: "effective",
      }),
    /confirmation/,
  );
  s = command(s, "intervention", {
    intervention: "rescue",
    state: "effective",
    confirmed: true,
  });
  assert.deepEqual(s.observations, before);
  assert.throws(() => command(s, "branch", { branch: "treated" }), /Confirm/);
  s = command(s, "branch", { branch: "treated", confirmed: true });
  assert.equal(s.observations.rr, 12);
});
test("early effective treatment bypasses reviewed deterioration", () => {
  let s = command(createSession(fixture(), "owner", 0), "start", {}, 0);
  s = command(s, "mode", { value: "guided" }, 0);
  s = command(
    s,
    "intervention",
    { intervention: "rescue", state: "performed" },
    1000,
  );
  s = command(
    s,
    "intervention",
    { intervention: "rescue", state: "effective", confirmed: true },
    1000,
  );
  s = command(s, "branch", { branch: "treated", confirmed: true }, 1000);
  s = command(s, "tick", {}, 20000);
  assert.equal(s.branch, "treated");
  assert.equal(s.observations.rr, 12);
});
test("oxygen, assisted ventilation and low spontaneous RR coexist independently", () => {
  let s = command(createSession(fixture(), "owner", 0), "start", {}, 0);
  s = command(s, "oxygen", {
    value: "Fixture oxygen at 4 L/min",
    device: "Fixture device",
    flow: 4,
  });
  s = command(s, "ventilation", { assisted: true, rate: 10 });
  s = command(s, "branch", { branch: "untreated" }, 10000);
  assert.equal(s.observations.rr, 2);
  assert.equal(s.observations.spo2, 98);
  assert.equal(s.ventilation.rate, 10);
  s = command(s, "stage", { stage: 3 }, 10000);
  assert.equal(s.oxygenFlow, 4);
  assert.equal(s.oxygen, "Fixture oxygen at 4 L/min");
  const p = monitorState(s, 10000);
  assert.deepEqual(p.ventilation, { assisted: true, rate: 10 });
  assert.equal(p.interventions, undefined);
});
test("manual overrides stay pinned through recovery until explicitly released", () => {
  let s = createSession(fixture(), "owner", 0);
  s = command(s, "override", { field: "rr", value: 7 });
  s = command(s, "intervention", {
    intervention: "rescue",
    state: "performed",
  });
  s = command(s, "intervention", {
    intervention: "rescue",
    state: "effective",
    confirmed: true,
  });
  s = command(s, "branch", { branch: "treated", confirmed: true });
  assert.equal(s.observations.rr, 7);
  s = command(s, "unpin", { field: "rr" });
  assert.equal(s.observations.rr, 12);
});
test("pause freezes progression, explicit thirty-minute jump preserves status, recurrence waits for resume", () => {
  let s = command(createSession(fixture(), "owner", 0), "start", {}, 0);
  s = command(s, "mode", { value: "guided" }, 0);
  s = command(
    s,
    "intervention",
    { intervention: "rescue", state: "administered" },
    0,
  );
  s = command(
    s,
    "intervention",
    { intervention: "rescue", state: "effective", confirmed: true },
    0,
  );
  s = command(s, "branch", { branch: "treated", confirmed: true }, 0);
  s = command(s, "pause", {}, 0);
  s = command(s, "tick", {}, 5000000);
  assert.equal(elapsed(s, 5000000), 0);
  assert.equal(s.branch, "treated");
  s = command(s, "timeJump", { jump: "30min", confirmed: true }, 5000000);
  assert.equal(elapsed(s, 6000000), 1800000);
  assert.equal(s.branch, "treated");
  assert.equal(s.status, "paused");
  s = command(s, "resume", {}, 6000000);
  assert.equal(s.branch, "recurrence");
  assert.equal(s.observations.rr, 3);
});
test("duplicate intervention deliveries and time jumps do not apply twice", () => {
  let s = command(createSession(fixture(), "owner", 0), "start", {}, 0);
  const c = {
    id: "stable",
    type: "intervention",
    intervention: "rescue",
    state: "administered",
  };
  s = applyCommand(s, c, 1000);
  assert.deepEqual(applyCommand(s, c, 2000), s);
  assert.deepEqual(
    command(
      s,
      "intervention",
      { intervention: "rescue", state: "administered" },
      2000,
    ),
    s,
  );
  s = command(s, "timeJump", { jump: "30min", confirmed: true }, 1000);
  const e = elapsed(s, 1000);
  assert.deepEqual(
    command(s, "timeJump", { jump: "30min", confirmed: true }, 1000),
    s,
  );
  assert.equal(e, 1801000);
});
test("urgent supplied text report releases immediately on request without history gate", () => {
  let s = createSession(fixture(), "owner", 0);
  const id = s.scenario.investigations[0].id;
  assert.equal(monitorState(s, 0).released.length, 0);
  s = command(s, "investigation", { investigation: id, state: "requested" });
  assert(s.investigations[id].requested && s.investigations[id].released);
  assert.equal(s.events.filter((e) => e.type === "investigation").length, 2);
  const p = monitorState(s, 1000);
  assert.equal(p.released[0].report, undefined);
  assert.equal(p.facultyPack, undefined);
  assert.equal(p.branch, undefined);
  assert.equal(p.scenario, undefined);
});
test("validation rejects recovery without effective intervention or unreviewed profiles", () => {
  const s = fixture();
  s.branches[1].conditions = { actions: [s.stages[0].actions[0].id] };
  assert.throws(() => validateScenario(s), /effective intervention/);
  const other = fixture();
  other.branches[0].reviewed = false;
  assert.throws(() => validateScenario(other), /explicit review/);
});
test('faculty-pack checklist responses cannot automatically improve physiology',()=>{
 const f=fixture(),a=f.stages[0].actions[0];a.response={reviewed:true,observations:{spo2:100}};
 assert.throws(()=>validateScenario(f),/not checklist responses/);
 let s=createSession(f,'owner',0);const before=s.observations;s=command(s,'action',{action:a.id,answer:'yes'});assert.deepEqual(s.observations,before);
});
test("guidance confirmation cannot be bypassed by an any timer/action rule", () => {
  const f = fixture();
  f.stages[0].transition = {
    reviewed: true,
    combination: "any",
    afterMs: 1,
    requireConfirmation: true,
  };
  let s = command(createSession(f, "owner", 0), "start", {}, 0);
  s = command(s, "mode", { value: "guided" }, 0);
  s = command(s, "tick", {}, 1000);
  assert.equal(s.stage, 0);
  s = command(s, "confirm", {}, 1000);
  assert.equal(s.stage, 1);
});
