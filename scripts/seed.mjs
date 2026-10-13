import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
if (
  process.env.GCLOUD_PROJECT &&
  !process.env.GCLOUD_PROJECT.startsWith("demo-")
)
  throw Error("Seed is emulator-only");
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
initializeApp({ projectId: "demo-simroom" });
const auth = getAuth();
let u;
try {
  u = await auth.getUserByEmail("instructor@simroom.test");
} catch {
  u = await auth.createUser({
    email: "instructor@simroom.test",
    password: "SimRoom123!",
    displayName: "Clinical Teaching Fellow",
  });
}
await auth.setCustomUserClaims(u.uid, { instructor: true });
const db = getFirestore();
if(process.argv.includes('--engine-fixture')){
 const s=structuredClone(JSON.parse(fs.readFileSync('functions/content/scenarios.json','utf8')).find(s=>s.id==='pe'));
 s.id='qa-phone-fixture';s.title='Nonclinical phone fixture';s.source='Test fixture only; not a teaching case';
 s.facultyPack={debriefQuestions:'Private fixture question',exampleSBAR:'Private fixture answer'};
 s.interventions=[{id:'fixture-rescue',name:'Nonclinical rescue fixture',guidance:'No clinical dose or treatment guidance.'}];
 s.branches=[{id:'fixture-recovery',name:'Fixture recovery',kind:'recovery',provenance:'faculty-authored',sourceNote:'Nonclinical UI fixture',reviewed:true,conditions:{interventions:[{id:'fixture-rescue',state:'effective'}]},observations:{rr:11}}];
 s.timeJumps=[{id:'fixture-jump',label:'Fixture thirty-minute jump',advanceMs:1800000,reviewed:true}];
 await db.doc('scenarios/'+s.id).set(s);
}
for (const s of JSON.parse(
  fs.readFileSync("functions/content/scenarios.json", "utf8"),
))
  await db.doc("scenarios/" + s.id).set(s);
await db
  .doc("sourceArchive/originals")
  .set(JSON.parse(fs.readFileSync("functions/content/originals.json", "utf8")));
console.log(
  "Emulator seeded. Instructor: instructor@simroom.test / SimRoom123!",
);
