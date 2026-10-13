import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  signInAnonymously,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import {
  getStorage,
  connectStorageEmulator,
  ref,
  uploadBytes,
  getBytes,
} from "firebase/storage";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
function client(name) {
  const app = initializeApp(
    {
      projectId: "demo-simroom",
      apiKey: "demo-key",
      authDomain: "demo-simroom.firebaseapp.com",
      storageBucket: "demo-simroom.appspot.com",
    },
    name,
  );
  const auth = getAuth(app),
    db = getFirestore(app),
    f = getFunctions(app),
    storage = getStorage(app);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(f, "127.0.0.1", 5001);
  return {
    app,
    auth,
    db,
    storage,
    call: async (n, d) => (await httpsCallable(f, n)(d)).data,
  };
}
const owner = client("owner"),
  monitor = client("monitor"),
  stranger = client("stranger");
try {
  await signInWithEmailAndPassword(
    owner.auth,
    "instructor@simroom.test",
    "SimRoom123!",
  );
  await signInAnonymously(monitor.auth);
  await signInAnonymously(stranger.auth);
  const { id, code } = await owner.call("create", { scenario: "pe" });
  assert.equal((await monitor.call("join", { code })).id, id);
  const command = async (type, data = {}, cid = crypto.randomUUID()) =>
    owner.call("command", { session: id, command: { id: cid, type, ...data } });
  await command("stage", { stage: 2 });
  let publicData = (await getDoc(doc(monitor.db, "monitors", id))).data();
  assert.equal(publicData.observations.spo2, 86);
  assert.equal(publicData.observations.sbp, 120); // Held initial cuff reading.
  await command("nibp");
  publicData = (await getDoc(doc(monitor.db, "monitors", id))).data();
  assert.equal(publicData.observations.sbp, 85);
  assert.equal(publicData.scenario, undefined);
  await assert.rejects(getDoc(doc(monitor.db, "sessions", id)));
  await assert.rejects(getDoc(doc(monitor.db, "scenarios", "pe")));
  await assert.rejects(getDoc(doc(stranger.db, "monitors", id)));
  await assert.rejects(
    setDoc(doc(monitor.db, "monitors", id), { observations: { hr: 1 } }),
  );
  await assert.rejects(
    monitor.call("command", {
      session: id,
      command: { id: "attack", type: "stage", stage: 0 },
    }),
  );
  await command("override", { field: "spo2", value: 91 });
  await command("stage", { stage: 3 });
  publicData = (await getDoc(doc(monitor.db, "monitors", id))).data();
  assert.equal(publicData.observations.spo2, 91);
  const s = (await getDoc(doc(owner.db, "sessions", id))).data();
  const action = s.scenario.stages[3].actions[0];
  await command("action", { action: action.id, answer: "notyet" });
  await command("prompt", { action: action.id });
  await command("action", { action: action.id, answer: "yes" });
  await command("note", { text: "Repeated command" }, "repeat");
  await command("note", { text: "Repeated command" }, "repeat");
  const updated = (await getDoc(doc(owner.db, "sessions", id))).data();
  assert.equal(updated.events.filter((e) => e.id === "repeat").length, 1);
  assert.equal(updated.actions[action.id], "yes");
  assert.equal(updated.observations.sbp, 85);
  await command("start");
  await command("pause");
  const paused = (await getDoc(doc(owner.db, "sessions", id))).data();
  assert.equal(paused.status, "paused");
  await command("resume");
  assert.equal(
    (await getDoc(doc(monitor.db, "monitors", id))).data().status,
    "running",
  );
  await command("stage", { stage: 0, duration: 10000 });
  await command("override", { field: "hr", value: 80 });
  const rampPinned = (await getDoc(doc(owner.db, "sessions", id))).data();
  assert.ok(rampPinned.ramp);
  assert.equal(rampPinned.ramp.to.sbp, 120);
  assert.equal(rampPinned.pins.hr, true);
  await command("unpin", { field: "hr" });
  const rampReturned = (await getDoc(doc(owner.db, "sessions", id))).data();
  assert.ok(rampReturned.ramp);
  assert.equal(rampReturned.ramp.to.sbp, 120);
  assert.equal(rampReturned.pins.hr, undefined);
  assert.equal(rampReturned.ramp.to.hr, 110);
  const originalPTX = (await getDoc(doc(owner.db, "scenarios", "ptx"))).data();
  assert.ok(
    originalPTX.history.includes("Semi-professional basketball player"),
  );
  const ptx = await owner.call("create", { scenario: "ptx" });
  await monitor.call("join", { code: ptx.code });
  for (let stage = 0; stage < 4; stage++) {
    await owner.call("command", {
      session: ptx.id,
      command: { id: crypto.randomUUID(), type: "stage", stage },
    });
    await owner.call('command',{session:ptx.id,command:{id:crypto.randomUUID(),type:'nibp'}});
    assert.deepEqual(
      (await getDoc(doc(monitor.db, "monitors", ptx.id))).data().observations,
      originalPTX.stages[stage].observations,
    );
  }
  const draft = structuredClone(updated.scenario);
  const path = `investigations/${owner.auth.currentUser.uid}/neutral-test.svg`;
  const fixture = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg"><text y="20">TEST FIXTURE: NO CLINICAL RESULT</text></svg>',
  );
  await uploadBytes(ref(owner.storage, path), fixture, {
    contentType: "image/svg+xml",
  });
  await assert.rejects(getBytes(ref(monitor.storage, path)));
  await assert.rejects(
    uploadBytes(
      ref(
        monitor.storage,
        `investigations/${monitor.auth.currentUser.uid}/unauthorised.svg`,
      ),
      fixture,
      { contentType: "image/svg+xml" },
    ),
  );
  draft.investigations[0].assetPath = path;
  const version = await owner.call("saveScenario", { scenario: draft });
  assert.equal(version.version, 2);
  assert.equal(
    (await getDoc(doc(owner.db, "sessions", id))).data().scenario.version,
    1,
  );
  const next = await owner.call("create", { scenario: "pe" });
  await monitor.call("join", { code: next.code });
  await assert.rejects(
    monitor.call("asset", { session: next.id, investigation: "ecg" }),
  );
  await owner.call("command", {
    session: next.id,
    command: {
      id: crypto.randomUUID(),
      type: "investigation",
      investigation: "ecg",
      state: "requested",
    },
  });
  assert.equal(
    (await getDoc(doc(monitor.db, "monitors", next.id))).data().released.length,
    0,
  );
  await owner.call("command", {
    session: next.id,
    command: {
      id: crypto.randomUUID(),
      type: "investigation",
      investigation: "ecg",
      state: "released",
    },
  });
  const released = await monitor.call("asset", {
    session: next.id,
    investigation: "ecg",
  });
  assert.equal(released.mime, "image/svg+xml");
  assert.equal(
    Buffer.from(released.data, "base64").toString(),
    new TextDecoder().decode(fixture),
  );
  await assert.rejects(
    stranger.call("asset", { session: next.id, investigation: "ecg" }),
  );
  const pack = structuredClone(draft);
  pack.id='qa-engine-fixture';pack.title='Nonclinical engine fixture';
  pack.facultyPack={originalText:'Private fixture pack',exampleSBAR:'Private expected answer'};
  pack.interventions=[{id:'fixture-rescue',name:'Nonclinical delivered intervention'}];
  pack.branches=[{id:'fixture-recovery',name:'Nonclinical recovery fixture',kind:'recovery',reviewed:true,provenance:'faculty-authored',sourceNote:'Synthetic permission fixture; not clinical content',conditions:{interventions:[{id:'fixture-rescue',state:'effective'}]},observations:{rr:11}}];
  pack.timeJumps=[{id:'fixture-jump',label:'Nonclinical thirty-minute jump',advanceMs:1800000,reviewed:true}];
  pack.investigations[0].report='Synthetic text fixture: not a clinical ECG interpretation.';
  pack.investigations[0].releaseOnRequest=true;
  await owner.call('saveScenario',{scenario:pack});
  const packSession=await owner.call('create',{scenario:pack.id});await monitor.call('join',{code:packSession.code});
  const packCommand=(type,data={})=>owner.call('command',{session:packSession.id,command:{id:crypto.randomUUID(),type,...data}});
  await assert.rejects(packCommand('branch',{branch:'fixture-recovery',confirmed:true}));
  await packCommand('intervention',{intervention:'fixture-rescue',state:'prescribed'});
  await assert.rejects(packCommand('intervention',{intervention:'fixture-rescue',state:'effective',confirmed:true}));
  await packCommand('intervention',{intervention:'fixture-rescue',state:'performed'});
  await packCommand('intervention',{intervention:'fixture-rescue',state:'effective',confirmed:true});
  await packCommand('branch',{branch:'fixture-recovery',confirmed:true});
  const projection=(await getDoc(doc(monitor.db,'monitors',packSession.id))).data();
  assert.equal(projection.observations.rr,11);assert.equal(projection.facultyPack,undefined);assert.equal(projection.interventions,undefined);assert.equal(projection.branch,undefined);
  await assert.rejects(monitor.call('command',{session:packSession.id,command:{id:crypto.randomUUID(),type:'timeJump',jump:'fixture-jump',confirmed:true}}));
  await packCommand('start');await packCommand('pause');await packCommand('timeJump',{jump:'fixture-jump',confirmed:true});
  assert((await getDoc(doc(owner.db,'sessions',packSession.id))).data().elapsed>=1800000);
  await assert.rejects(monitor.call('asset',{session:packSession.id,investigation:'ecg'}));
  await packCommand('investigation',{investigation:'ecg',state:'requested'});
  const report=await monitor.call('asset',{session:packSession.id,investigation:'ecg'});
  assert.equal(Buffer.from(report.data,'base64').toString('utf8'),pack.investigations[0].report);
  await assert.rejects(stranger.call('asset',{session:packSession.id,investigation:'ecg'}));
  console.log(
    "PASS emulator integration: owner control, monitor data restrictions, stages, pins, actions, retries, pause/resume, version snapshots, private Storage and investigation release. Physical devices remain untested.",
  );
} finally {
  await Promise.all([owner, monitor, stranger].map((c) => deleteApp(c.app)));
}
