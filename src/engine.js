import {ruleMatches,ruleSummary,validateRules,limits} from "./rules.js";
export const fields = ["hr", "spo2", "sbp", "dbp", "rr", "temp"];
export const interventionStates = [
  "requested",
  "prescribed",
  "administered",
  "performed",
  "effective",
];
export function activeProfile(s) {
  const b = s.scenario.branches?.find((b) => b.id === s.branch);
  return { ...s.scenario.stages[s.stage].observations, ...b?.observations, ...s.activeRuleTargets };
}
export function conditionsMet(s, condition, now) {
  if (!condition) return true;
  const since =
    condition.clock === "session"
      ? 0
      : condition.clock === "branch"
        ? (s.branchAt ?? s.stageAt)
        : s.stageAt;
  return (
    (!condition.actions?.length ||
      condition.actions.every((id) => s.actions[id] === "yes")) &&
    (!condition.interventions?.length ||
      condition.interventions.every(
        (i) => s.interventions?.[i.id]?.[i.state] === true,
      )) &&
    (!condition.unlessEffective?.length ||
      condition.unlessEffective.every(
        (id) => !s.interventions?.[id]?.effective,
      )) &&
    (!condition.fromBranches?.length ||
      condition.fromBranches.includes(s.branch)) &&
    (condition.stage == null || condition.stage === s.stage) &&
    (condition.afterMs == null || elapsed(s, now) - since >= condition.afterMs)
  );
}
function setProfile(s, target, now, duration = 0) {
  const old = values(s, now);
  s.observations = Object.fromEntries(
    fields.map((k) => [k, s.pins[k] ? old[k] : (target[k] ?? old[k])]),
  );
  s.ramp = duration
    ? { from: old, to: s.observations, at: elapsed(s, now), duration }
    : null;
}
function selectBranch(s, b, now, confirmed) {
  if (!b || b.reviewed !== true) throw Error("Branch requires faculty review");
  if (!conditionsMet(s, b.conditions, now))
    throw Error("Branch conditions are not met");
  if (
    (b.requireConfirmation ||
      b.kind === "recovery" ||
      b.kind === "treatment") &&
    confirmed !== true
  )
    throw Error("Confirm clinical effectiveness before selecting this branch");
  if (
    b.kind === "recovery" &&
    !b.conditions?.interventions?.some(
      (i) => i.state === "effective" && s.interventions?.[i.id]?.effective,
    )
  )
    throw Error("Recovery needs a confirmed effective intervention");
  s.branch = b.id;
  s.activeRuleTargets={};
  s.branchAt = elapsed(s, now);
  setProfile(s, b.observations || {}, now, b.durationMs || 0);
}
export function elapsed(s, now) {
  return s.elapsed + (s.status === "running" ? Math.max(0, now - s.anchor) : 0);
}
export function values(s, now) {
  if (!s.ramp) return s.observations;
  const p = Math.min(
    1,
    Math.max(0, (elapsed(s, now) - s.ramp.at) / s.ramp.duration),
  );
  return Object.fromEntries(
    fields.map((k) => [
      k,
      s.pins[k]
        ? s.observations[k]
        : +(s.ramp.from[k] + (s.ramp.to[k] - s.ramp.from[k]) * p).toFixed(1),
    ]),
  );
}
export function createSession(scenario, owner, now) {
  return {
    owner,
    confirmed:false,
    rhythmPinned:false,
    signalPinned:false,
    activeRuleTargets:{},
    scenario: structuredClone(scenario),
    stage: 0,
    status: "ready",
    elapsed: 0,
    anchor: now,
    stageAt: 0,
    observations: { ...scenario.stages[0].observations },
    oxygen: scenario.stages[0].oxygen,
    oxygenPinned: false,
    rhythm: scenario.stages[0].rhythm,
    perfusion: scenario.stages[0].perfusion || "normal",
    signalQuality: scenario.stages[0].signalQuality || "clean",
    pins: {},
    actions: {},
    investigations: {},
    events: [],
    revision: 0,
    updatedAt: now,
    mode: "manual",
    ramp: null,
    alarmAck: false,
    interventions: {},
    branch: null,
    appliedBranches: [],
    appliedRules: [],
    timeJumps: [],
    ventilation: { assisted: false, rate: null },
    oxygenDevice:
      scenario.stages[0].oxygenSetting?.device ?? scenario.stages[0].oxygen,
    oxygenFlow: scenario.stages[0].oxygenSetting?.flow ?? null,
  };
}
function stage(s, index, now, duration = 0) {
  if (!Number.isInteger(index) || !s.scenario.stages[index])
    throw Error("Invalid stage");
  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration < 0 ||
    duration > 3600000
  )
    throw Error("Invalid change duration");
  const old = values(s, now);
  s.stage = index;
  s.stageAt = elapsed(s, now);
  s.branch = null;
  s.activeRuleTargets={};
  s.confirmed = false;
  const target = s.scenario.stages[index];
  s.observations = {
    ...target.observations,
    ...Object.fromEntries(
      fields.filter((k) => s.pins[k]).map((k) => [k, old[k]]),
    ),
  };
  // Oxygen is a delivered intervention: stage selection never changes it.
  if (!s.rhythmPinned) s.rhythm = target.rhythm;
  if (!s.signalPinned){s.perfusion=target.perfusion || "normal";s.signalQuality=target.signalQuality || "clean";}
  s.ramp = duration
    ? { from: old, to: s.observations, at: elapsed(s, now), duration }
    : null;
}
export function applyCommand(original, c, now) {
  const s = structuredClone(original);
  if (s.events.some((e) => e.id === c.id)) return s;
  if (!c.id || typeof c.id !== "string" || c.id.length > 128)
    throw Error("Command identifier required");
  if (s.status === "ended" && !["reset", "note", "tick"].includes(c.type))
    throw Error("Session ended");
  let label = c.type;
  switch (c.type) {
    case "start":
    case "resume":
      if (["ready", "paused"].includes(s.status)) {
        s.anchor = now;
        s.status = "running";
      }
      break;
    case "pause":
    case "end":
      s.elapsed = elapsed(s, now);
      s.anchor = now;
      s.status = c.type === "end" ? "ended" : "paused";
      break;
    case "reset": {
      const fresh = createSession(s.scenario, s.owner, now);
      Object.assign(s, fresh, { events: s.events, revision: s.revision });
      break;
    }
    case "stage":
      stage(s, c.stage, now, c.duration || 0);
      label = `Stage ${c.stage + 1}: ${s.scenario.stages[c.stage].name}`;
      break;
    case "signal":
      if(!["normal","poor","absent"].includes(c.perfusion) || !["clean","artefact"].includes(c.quality))throw Error("Invalid signal setting");
      s.perfusion=c.perfusion;s.signalQuality=c.quality;s.signalPinned=true;label=`Perfusion ${c.perfusion}; signal ${c.quality}`;break;
    case "signalScenario":
      s.signalPinned=false;s.perfusion=s.scenario.stages[s.stage].perfusion || "normal";s.signalQuality=s.scenario.stages[s.stage].signalQuality || "clean";break;
    case "override":
      if (
        !fields.includes(c.field) ||
        typeof c.value !== "number" ||
        !Number.isFinite(c.value) ||
        c.value < 0 ||
        c.value > limits[c.field][1]
      )
        throw Error("Invalid observation");
      s.observations[c.field] = c.value;
      s.pins[c.field] = true;
      label = `${c.field} overridden to ${c.value}`;
      break;
    case "unpin":
      if (!fields.includes(c.field)) throw Error("Invalid field");
      delete s.pins[c.field];
      s.observations[c.field] = activeProfile(s)[c.field];
      if (s.ramp) {
        s.ramp.from[c.field] = s.observations[c.field];
        s.ramp.to[c.field] = s.observations[c.field];
      }
      break;
    case "oxygen":
      if (typeof c.value !== "string" || c.value.length > 120)
        throw Error("Invalid oxygen");
      s.oxygen = c.value;
      s.oxygenPinned = true;
      if (
        c.device != null &&
        (typeof c.device !== "string" || c.device.length > 120)
      )
        throw Error("Invalid oxygen device");
      if (
        c.flow != null &&
        (!Number.isFinite(c.flow) || c.flow < 0 || c.flow > 100)
      )
        throw Error("Invalid oxygen flow");
      s.oxygenDevice = c.device ?? c.value;
      s.oxygenFlow = c.flow ?? null;
      break;
    case "oxygenScenario":
      s.oxygenPinned = false;
      s.oxygen = s.scenario.stages[s.stage].oxygen;
      s.oxygenDevice =
        s.scenario.stages[s.stage].oxygenSetting?.device ?? s.oxygen;
      s.oxygenFlow = s.scenario.stages[s.stage].oxygenSetting?.flow ?? null;
      break;
    case "rhythm":
      if (![null, "sinus", "vf", "asystole"].includes(c.value))
        throw Error("Invalid rhythm");
      s.rhythm = c.value;
      s.rhythmPinned = true;
      break;
    case "rhythmScenario":
      s.rhythmPinned = false;
      s.rhythm = s.scenario.stages[s.stage].rhythm;
      break;
    case "ventilation":
      if (
        typeof c.assisted !== "boolean" ||
        (c.rate != null &&
          (!Number.isFinite(c.rate) || c.rate < 0 || c.rate > 100))
      )
        throw Error("Invalid assisted ventilation");
      s.ventilation = {
        assisted: c.assisted,
        rate: c.assisted ? (c.rate ?? null) : null,
      };
      label = c.assisted
        ? `Assisted ventilation recorded${c.rate == null ? "" : ` at ${c.rate}/min`}; spontaneous RR unchanged`
        : "Assisted ventilation stopped";
      break;
    case "intervention": {
      const item = s.scenario.interventions?.find(
        (i) => i.id === c.intervention,
      );
      if (!item || !interventionStates.includes(c.state))
        throw Error("Invalid intervention state");
      s.interventions ||= {};
      const status = (s.interventions[item.id] ||= {});
      if (
        c.state === "effective" &&
        (c.confirmed !== true || !(status.administered || status.performed))
      )
        throw Error(
          "Effectiveness requires faculty confirmation after delivery",
        );
      if (status[c.state]) return original; // An intervention state is applied once, even with a new command id.
      status[c.state] = true;
      label = `${item.name}: ${c.state}${c.state === "effective" ? " · faculty confirmed" : ""}`;
      break;
    }
    case "branch": {
      const b = s.scenario.branches?.find((b) => b.id === c.branch);
      if (b && s.branch === b.id) return original;
      selectBranch(s, b, now, c.confirmed);
      s.appliedBranches ||= [];
      if (!s.appliedBranches.includes(b.id)) s.appliedBranches.push(b.id);
      label = `${b.name} · ${b.kind} · ${b.provenance}`;
      break;
    }
    case "timeJump": {
      const jump = s.scenario.timeJumps?.find((j) => j.id === c.jump);
      if (!jump || jump.reviewed !== true || c.confirmed !== true)
        throw Error("A reviewed time jump needs faculty confirmation");
      if (!["running", "paused"].includes(s.status))
        throw Error("Start the simulation before a time jump");
      s.timeJumps ||= [];
      if (s.timeJumps.includes(jump.id)) return original;
      const before = elapsed(s, now);
      const current = values(s, now);
      if (s.ramp) {
        const remaining = Math.max(0, s.ramp.duration - (before - s.ramp.at));
        s.ramp = remaining
          ? {
              ...s.ramp,
              from: current,
              at: before + jump.advanceMs,
              duration: remaining,
            }
          : null;
      }
      s.observations = current;
      s.elapsed = before + jump.advanceMs;
      s.anchor = now;
      s.timeJumps.push(jump.id);
      label = `${jump.label} · simulated time +${jump.advanceMs / 60000} min`;
      break;
    }
    case "action":
    case "prompt": {
      const a = s.scenario.stages
        .flatMap((x) => x.actions)
        .find((x) => x.id === c.action);
      if (!a) throw Error("Unknown action");
      label = a.text;
      if (c.type === "action") {
        if (!["yes", "notyet"].includes(c.answer))
          throw Error("Invalid answer");
        const firstYes = s.actions[a.id] !== "yes";
        s.actions[a.id] = c.answer;
        if (c.answer === "yes" && firstYes && a.response?.reviewed === true && !s.scenario.facultyPack) {
          for (const k of fields)
            if (a.response.observations?.[k] !== undefined && !s.pins[k]) {
              s.observations[k] = a.response.observations[k];
              if (s.ramp) {
                s.ramp.from[k] = s.observations[k];
                s.ramp.to[k] = s.observations[k];
              }
            }
        }
      }
      break;
    }
    case "investigation": {
      const i = s.scenario.investigations.find((x) => x.id === c.investigation);
      if (!i || !["requested", "released", "interpreted"].includes(c.state))
        throw Error("Invalid investigation");
      if (c.state === "released" && !i.assetPath && !i.report)
        throw Error("Awaiting a faculty-supplied asset");
      if (
        c.state === "released" &&
        (!conditionsMet(s, i.releaseConditions, now) ||
          (i.requireConfirmation && c.confirmed !== true))
      )
        throw Error("Investigation release conditions require faculty review");
      s.investigations[i.id] = { ...s.investigations[i.id], [c.state]: true };
      if (
        c.state === "requested" &&
        i.releaseOnRequest === true &&
        (i.report || i.assetPath) &&
        conditionsMet(s, i.releaseConditions, now) &&
        !i.requireConfirmation
      )
        s.investigations[i.id].released = true;
      label = `${i.name}: ${c.state}`;
      if (c.state === "requested" && s.investigations[i.id].released)
        s.events.push({
          id: c.id + "-release",
          at: elapsed(s, now),
          type: "investigation",
          label: `${i.name}: released immediately on request`,
          stage: s.stage,
        });
      break;
    }
    case "cue":
    case "note":
      if (
        typeof c.text !== "string" ||
        c.text.length > (c.type === "cue" ? 20000 : 2000)
      )
        throw Error("Invalid note");
      label = c.text;
      break;
    case "mode":
      if (!["manual", "guided"].includes(c.value)) throw Error("Invalid mode");
      s.mode = c.value;
      break;
    case "confirm":
      s.confirmed = true;
      break;
    case "alarm":
      s.alarmAck = true;
      break;
    case "tick":
      break;
    default:
      throw Error("Unknown command");
  }
  if (s.mode === "guided" && s.status === "running") {
    const t = s.scenario.stages[s.stage].transition;
    if (t?.reviewed && t.combination && s.stage < s.scenario.stages.length-1) {
      const checks = [];
      if (t.actions?.length)
        checks.push(t.actions.every((a) => s.actions[a] === "yes"));
      if (t.afterMs != null)
        checks.push(elapsed(s, now) - s.stageAt >= t.afterMs);
      if (t.requireConfirmation && !checks.length) checks.push(true);
      const confirmed = !t.requireConfirmation || s.confirmed === true;
      if (
        confirmed &&
        checks.length &&
        (t.combination === "all" ? checks.every(Boolean) : checks.some(Boolean))
      ) {
        stage(s, s.stage + 1, now, t.durationMs || 0);
        s.confirmed = false;
        s.events.push({
          id: c.id + "-transition",
          at: elapsed(s, now),
          type: "stage",
          label: `Guided stage ${s.stage + 1}`,
          stage: s.stage,
        });
      }
    }
  }
  if (s.mode === "guided" && s.status === "running") {
    const b = s.scenario.branches?.find(
      (b) =>
        b.automatic &&
        b.reviewed === true &&
        b.kind === "deterioration" &&
        !b.requireConfirmation &&
        !s.appliedBranches?.includes(b.id) &&
        conditionsMet(s, b.conditions, now),
    );
    if (b) {
      selectBranch(s, b, now, false);
      s.appliedBranches ||= [];
      s.appliedBranches.push(b.id);
      s.events.push({
        id: c.id + "-branch",
        at: elapsed(s, now),
        type: "branch",
        label: `${b.name} · confirmed reviewed deterioration rule`,
        stage: s.stage,
        branch: b.id,
        observations: values(s, now),
      });
    }
  }
  if(s.mode==="guided" && s.status==="running"){
    const rules=s.scenario.stages[s.stage].rules || [];
    const r=rules.find(r=>r.reviewed && !s.appliedRules?.includes(r.id) && (ruleMatches(r,s,elapsed(s,now)) || r.otherwise && r.when.some(c=>c.kind==="time" && elapsed(s,now)-s.stageAt>=c.afterMs)));
    if(r){const matched=ruleMatches(r,s,elapsed(s,now));s.appliedRules ||= [];s.appliedRules.push(r.id);
      const target=matched?r.then.stage:r.otherwise;
      if(target)stage(s,s.scenario.stages.findIndex(st=>st.id===target),now,r.durationMs||0);
      if(matched && r.then.observations){setProfile(s,r.then.observations,now,r.durationMs||0);s.activeRuleTargets={...s.activeRuleTargets,...r.then.observations};}
      if(matched && r.then.release){const item=s.scenario.investigations.find(i=>i.id===r.then.release);if(item && (item.report||item.assetPath) && conditionsMet(s,item.releaseConditions,now) && !item.requireConfirmation){s.investigations[item.id] ||= {};s.investigations[item.id].released=true;s.events.push({id:c.id+"-release",at:elapsed(s,now),type:"investigation",label:`Released ${item.name}`,stage:s.stage});}}
      s.events.push({id:c.id+"-rule",at:elapsed(s,now),type:"rule",label:matched?ruleSummary(r,s.scenario):`Explicit alternative → ${s.scenario.stages[s.stage].name}`,stage:s.stage,observations:values(s,now)});
      if(matched && r.then.cue)s.events.push({id:c.id+"-cue",at:elapsed(s,now),type:"cue",label:r.then.cue,stage:s.stage});
      s.confirmed=false;
    }
  }
  if (c.type !== "tick")
    s.events.push({
      id: c.id,
      at: elapsed(s, now),
      type: c.type,
      label,
      stage: s.stage,
      ...(c.action ? { action: c.action, answer: c.answer || null } : {}),
      ...(c.intervention
        ? { intervention: c.intervention, interventionState: c.state }
        : {}),
      ...(s.branch ? { branch: s.branch } : {}),
      oxygen: s.oxygen,
      ventilation: s.ventilation,
      observations: values(s, now),
    });
  s.revision++;
  s.updatedAt = now;
  return s;
}
export function monitorState(s, now) {
  const observations = (o) => Object.fromEntries(fields.map((k) => [k, o[k]]));
  return {
    patient: s.scenario.patient,
    status: s.status,
    elapsed: s.elapsed,
    anchor: s.anchor,
    observations: observations(s.observations),
    ramp: s.ramp
      ? {
          at: s.ramp.at,
          duration: s.ramp.duration,
          from: observations(s.ramp.from),
          to: observations(s.ramp.to),
        }
      : null,
    pins: Object.fromEntries(
      fields.filter((k) => s.pins[k]).map((k) => [k, true]),
    ),
    oxygen: s.oxygen,
    oxygenDevice: s.oxygenDevice ?? s.oxygen,
    oxygenFlow: s.oxygenFlow ?? null,
    ventilation: {
      assisted: s.ventilation?.assisted === true,
      rate: s.ventilation?.rate ?? null,
    },
    rhythm: s.rhythm,
    perfusion: ["normal","poor","absent"].includes(s.perfusion)?s.perfusion:"normal",
    signalQuality:s.signalQuality==="artefact"?"artefact":"clean",
    revision: s.revision,
    updatedAt: now,
    alarmAck: s.alarmAck,
    released: s.scenario.investigations
      .filter((i) => s.investigations[i.id]?.released)
      .map((i) => ({ id: i.id, name: i.name })),
  };
}
export function validateScenario(s) {
  const text = (v, n, max = 20000) => {
    if (typeof v !== "string" || v.length > max) throw Error(`Invalid ${n}`);
  };
  const observation = (v) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 400)
      throw Error("Invalid observations");
  };
  if (
    !s ||
    !Array.isArray(s.stages) ||
    (s.stages.length < 1 || s.stages.length > 30) ||
    !Array.isArray(s.investigations) ||
    !Array.isArray(s.objectives)
  )
    throw Error(
      "Scenario must have 1–30 stages, investigations and objectives",
    );
  for (const k of [
    "id",
    "title",
    "patient",
    "briefing",
    "history",
    "preparation",
    "source",
  ])
    text(s[k], k);
  if (!s.title.trim() || !Array.isArray(s.review))
    throw Error("Missing scenario title or review list");
  if (new TextEncoder().encode(JSON.stringify(s)).byteLength > 300000)
    throw Error("Scenario exceeds 300 KB limit");
  const objectives = new Set();
  for (const o of s.objectives) {
    text(o.id, "objective identifier", 100);
    text(o.text, "objective");
    if (objectives.has(o.id)) throw Error("Duplicate objective");
    objectives.add(o.id);
  }
  const ids = new Set();
  for (const st of s.stages) {
    for (const k of [
      "id",
      "name",
      "oxygen",
      "findings",
      "cues",
      "sourceTrigger",
    ])
      text(st[k], k);
    if(st.perfusion!=null && !["normal","poor","absent"].includes(st.perfusion))throw Error("Invalid perfusion");
    if(st.signalQuality!=null && !["clean","artefact"].includes(st.signalQuality))throw Error("Invalid signal quality");
    if (![null, "sinus", "vf", "asystole"].includes(st.rhythm))
      throw Error("Invalid rhythm");
    if (!Array.isArray(st.actions))
      throw Error("Stage actions must be an array");
    for (const k of fields) observation(st.observations?.[k]);
    if (Object.keys(st.observations).some((k) => !fields.includes(k)))
      throw Error("Unsupported stage observation");
    for (const a of st.actions) {
      text(a.id, "action identifier", 100);
      text(a.text, "action");
      if (ids.has(a.id) || !a.id || !a.text)
        throw Error("Action identifiers must be unique");
      if (!objectives.has(a.objective)) throw Error("Unknown action objective");
      ids.add(a.id);
      if (a.response) {
        if(s.facultyPack)throw Error("Faculty packs route physiology through confirmed intervention branches, not checklist responses");
        if (
          a.response.reviewed !== true ||
          !a.response.observations ||
          typeof a.response.observations !== "object"
        )
          throw Error("Responses need explicit review and observations");
        for (const [k, v] of Object.entries(a.response.observations)) {
          if (!fields.includes(k)) throw Error("Unknown response observation");
          observation(v);
        }
      }
    }
    if (st.transition) {
      const t = st.transition;
      if (
        t.reviewed !== true ||
        !["all", "any"].includes(t.combination) ||
        (t.afterMs != null && (!Number.isFinite(t.afterMs) || t.afterMs < 0)) ||
        (t.durationMs != null &&
          (!Number.isFinite(t.durationMs) ||
            t.durationMs < 0 ||
            t.durationMs > 3600000)) ||
        (t.actions != null && !Array.isArray(t.actions)) ||
        (t.requireConfirmation != null &&
          typeof t.requireConfirmation !== "boolean")
      )
        throw Error("Invalid reviewed transition");
      if (!t.actions?.length && t.afterMs == null && !t.requireConfirmation)
        throw Error("Transition needs a reviewed condition");
    }
  }
  for (const st of s.stages)
    if (st.transition?.actions?.some((a) => !ids.has(a)))
      throw Error("Unknown transition action");
  const investigations = new Set();
  for (const i of s.investigations) {
    text(i.id, "investigation identifier", 100);
    text(i.name, "investigation name");
    if (investigations.has(i.id)) throw Error("Duplicate investigation");
    investigations.add(i.id);
    if (
      i.assetPath !== null &&
      (typeof i.assetPath !== "string" ||
        !/^investigations\/[^/]+\/[^/]+$/.test(i.assetPath))
    )
      throw Error("Asset path must refer to private investigation storage");
    if (i.report != null) text(i.report, "supplied synthetic report", 50000);
    if (i.releaseOnRequest != null && typeof i.releaseOnRequest !== "boolean")
      throw Error("Invalid immediate release setting");
  }
  const interventionIds = new Set();
  for (const i of s.interventions || []) {
    text(i.id, "intervention identifier", 100);
    text(i.name, "intervention name");
    if (!i.id || interventionIds.has(i.id))
      throw Error("Duplicate intervention");
    interventionIds.add(i.id);
    if (i.guidance != null)
      text(i.guidance, "exact intervention guidance", 50000);
    if (i.objective != null && !objectives.has(i.objective))
      throw Error("Unknown intervention objective");
  }
  const branchIds = new Set();
  for (const b of s.branches || []) {
    text(b.id, "branch identifier", 100);
    text(b.name, "branch name");
    text(b.sourceNote, "branch source qualification");
    if (
      !b.id ||
      branchIds.has(b.id) ||
      !["deterioration", "treatment", "recovery"].includes(b.kind) ||
      !["original", "faculty-authored"].includes(b.provenance) ||
      b.reviewed !== true
    )
      throw Error(
        "Branches need unique identifiers, provenance and explicit review",
      );
    branchIds.add(b.id);
    if (
      b.durationMs != null &&
      (!Number.isFinite(b.durationMs) ||
        b.durationMs < 0 ||
        b.durationMs > 3600000)
    )
      throw Error("Invalid branch duration");
    if (b.observations)
      for (const [k, v] of Object.entries(b.observations)) {
        if (!fields.includes(k)) throw Error("Unknown branch observation");
        observation(v);
      }
    for (const k of ["findings", "cues"])
      if (b[k] != null) text(b[k], k, 50000);
    if (
      b.kind === "recovery" &&
      !b.conditions?.interventions?.some((i) => i.state === "effective")
    )
      throw Error("Recovery requires an effective intervention condition");
    if (
      b.automatic &&
      (b.kind !== "deterioration" ||
        b.requireConfirmation ||
        b.conditions?.afterMs == null)
    )
      throw Error("Only explicitly timed deterioration may be automatic");
  }
  const validateConditions = (c) => {
    if (!c) return;
    if (
      c.actions?.some((id) => !ids.has(id)) ||
      c.interventions?.some(
        (i) =>
          !interventionIds.has(i.id) || !interventionStates.includes(i.state),
      ) ||
      c.unlessEffective?.some((id) => !interventionIds.has(id)) ||
      c.fromBranches?.some((id) => !branchIds.has(id))
    )
      throw Error("Unknown branch/release condition identifier");
    if (
      (c.stage != null &&
        (!Number.isInteger(c.stage) || c.stage < 0 || c.stage >= s.stages.length)) ||
      (c.afterMs != null && (!Number.isFinite(c.afterMs) || c.afterMs < 0)) ||
      (c.clock != null && !["session", "stage", "branch"].includes(c.clock))
    )
      throw Error("Invalid condition timing or stage");
  };
  for (const b of s.branches || []) validateConditions(b.conditions);
  for (const i of s.investigations) validateConditions(i.releaseConditions);
  const jumps = new Set();
  for (const j of s.timeJumps || []) {
    text(j.id, "time jump identifier", 100);
    text(j.label, "time jump label");
    if (
      jumps.has(j.id) ||
      !j.id ||
      j.reviewed !== true ||
      !Number.isFinite(j.advanceMs) ||
      j.advanceMs <= 0 ||
      j.advanceMs > 86400000
    )
      throw Error("Invalid reviewed time jump");
    jumps.add(j.id);
  }
  if (s.facultyPack) {
    for (const [k, v] of Object.entries(s.facultyPack))
      if (typeof v !== "string" || v.length > 100000)
        throw Error(`Invalid faculty pack section ${k}`);
  }
  for (const st of s.stages) {
    if (
      st.oxygenSetting &&
      (typeof st.oxygenSetting.device !== "string" ||
        (st.oxygenSetting.flow != null &&
          (!Number.isFinite(st.oxygenSetting.flow) ||
            st.oxygenSetting.flow < 0 ||
            st.oxygenSetting.flow > 100)))
    )
      throw Error("Invalid stage oxygen setting");
  }
  validateRules(s);
  return s;
}
