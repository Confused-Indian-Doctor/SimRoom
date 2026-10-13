// Run only in a trusted administrator environment with Application Default Credentials.
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
const project = process.argv[2];
if (!project || project.startsWith("demo-") || process.argv[3] !== "--reviewed")
  throw Error(
    "Usage: node scripts/import-production.mjs PROJECT_ID --reviewed",
  );
if (process.env.FIRESTORE_EMULATOR_HOST)
  throw Error("Unset emulator host before production import");
initializeApp({ projectId: project });
const db = getFirestore();
const batch = db.batch();
for (const s of JSON.parse(
  fs.readFileSync("functions/content/scenarios.json", "utf8"),
)) {
  const existing = await db.doc("scenarios/" + s.id).get();
  if (existing.exists)
    throw Error(
      "Existing scenario found; use editor versioning instead of overwriting",
    );
  batch.set(db.doc("scenarios/" + s.id), s);
  batch.set(db.doc(`scenarioVersions/${s.id}-${s.version}`), s);
}
batch.set(
  db.doc("sourceArchive/originals"),
  JSON.parse(fs.readFileSync("functions/content/originals.json", "utf8")),
);
await batch.commit();
console.log(
  "Reviewed source scenarios imported. No production demo account created.",
);
