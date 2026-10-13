import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { randomBytes } from "node:crypto";
import {
  applyCommand,
  processCommand,
  replaySession,
  createSession,
  monitorState,
  validateScenario,
} from "./engine.js";
initializeApp();
const db = getFirestore();
db.settings({ignoreUndefinedProperties:true});
const options = { cors: true };
function instructor(req) {
  if (!req.auth?.token.instructor)
    throw new HttpsError("permission-denied", "Instructor access required");
  return req.auth.uid;
}
export const create = onCall(options, async (req) => {
  const uid = instructor(req);
  const doc = await db.doc("scenarios/" + req.data.scenario).get();
  if (!doc.exists) throw new HttpsError("not-found", "Scenario not found");
  const id = randomBytes(9).toString("hex"),
    code = randomBytes(4).toString("hex").toUpperCase(),
    now = Date.now();
  const s = { ...createSession(doc.data(), uid, now), code };
  const batch = db.batch();
  batch.set(db.doc("sessions/" + id), s);
  batch.set(db.doc("monitors/" + id), monitorState(s, now));
  batch.set(db.doc("joinCodes/" + code), { session: id });
  await batch.commit();
  return { id, code };
});
export const join = onCall(options, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const code = String(req.data.code || "").toUpperCase();
  const ref = await db.doc("joinCodes/" + code).get();
  if (!ref.exists) throw new HttpsError("not-found", "Unknown session code");
  const id = ref.data().session;
  const s = (await db.doc("sessions/" + id).get()).data();
  if (s.status === "ended")
    throw new HttpsError("failed-precondition", "Session ended");
  await db
    .doc(`monitorMembers/${id}/users/${req.auth.uid}`)
    .set({ joined: Date.now() });
  return { id };
});
export const command = onCall(options, async (req) => {
  const uid = instructor(req);
  const ref = db.doc("sessions/" + req.data.session);
  const outcome=await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists || doc.data().owner !== uid)
      throw new HttpsError("permission-denied", "Session owner required");
    let s;
    try {
      const result=processCommand(doc.data(),req.data.command,Math.max(Date.now(),doc.data().updatedAt));
      s=result.state;
      if(!result.accepted){tx.set(ref,s);tx.set(db.doc("monitors/"+ref.id),monitorState(s,Date.now()));return {revision:s.revision,accepted:false,error:result.error};}
    } catch (e) {
      throw new HttpsError("invalid-argument", e.message);
    }
    if (s.revision === doc.data().revision) return { revision: s.revision };
    tx.set(ref, s);
    tx.set(db.doc("monitors/" + ref.id), monitorState(s, Date.now()));
    return { revision: s.revision };
  });
  if(outcome.accepted===false)throw new HttpsError("invalid-argument",outcome.error);
  return outcome;
});
export const saveScenario = onCall(options, async (req) => {
  instructor(req);
  let draft;
  try {
    draft = validateScenario(req.data.scenario);
  } catch (e) {
    throw new HttpsError("invalid-argument", e.message);
  }
  if (!/^[a-z0-9-]+$/.test(draft.id))
    throw new HttpsError("invalid-argument", "Invalid scenario identifier");
  return db.runTransaction(async (tx) => {
    const ref = db.doc("scenarios/" + draft.id),
      old = await tx.get(ref);
    const version = (old.data()?.version || 0) + 1;
    tx.set(ref, { ...draft, version });
    tx.set(db.doc(`scenarioVersions/${draft.id}-${version}`), {
      ...draft,
      version,
    });
    return { version };
  });
});
export const asset = onCall(options, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const s = (await db.doc("sessions/" + req.data.session).get()).data();
  if (!s) throw new HttpsError("not-found", "Session not found");
  const owned = s.owner === req.auth.uid && req.auth.token.instructor;
  const member = (
    await db
      .doc(`monitorMembers/${req.data.session}/users/${req.auth.uid}`)
      .get()
  ).exists;
  const results=s.engine?.measurements.results||[],result=req.data.instance?results.find(r=>r.id===req.data.instance&&r.investigation===req.data.investigation):results.filter(r=>r.investigation===req.data.investigation&&r.releasedAt!=null).at(-1);
  if (
    !owned &&
    (!member || (req.data.instance?!result||result.releasedAt==null:!s.investigations[req.data.investigation]?.released))
  )
    throw new HttpsError("permission-denied", "Result not released");
  const definition = s.scenario.investigations.find(
    (i) => i.id === req.data.investigation,
  ),i=result?.acquiredAt!=null?{...definition,report:result.report,assetPath:result.assetPath}:definition;
  if (i?.report)
    return {
      data: Buffer.from(i.report, "utf8").toString("base64"),
      mime: "text/plain;charset=utf-8",
    };
  if (!i?.assetPath) throw new HttpsError("not-found", "Asset missing");
  const f = getStorage().bucket().file(i.assetPath);
  const [meta] = await f.getMetadata();
  if (Number(meta.size) > 10 * 1024 * 1024)
    throw new HttpsError("failed-precondition", "Asset too large");
  const [b] = await f.download();
  return { data: b.toString("base64"), mime: meta.contentType };
});

export const replay = onCall(options,async req=>{const uid=instructor(req);const data=(await db.doc('sessions/'+req.data.session).get()).data();if(!data||data.owner!==uid)throw new HttpsError('permission-denied','Session owner required');const state=replaySession(data);return {state,matches:JSON.stringify(state.observations)===JSON.stringify(data.observations),commands:data.engine?.commands.length||0};});
