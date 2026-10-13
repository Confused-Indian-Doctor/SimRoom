import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
const [project, uid] = process.argv.slice(2);
if (!project || !uid)
  throw Error("Usage: node scripts/grant-instructor.mjs PROJECT_ID USER_UID");
initializeApp({ projectId: project });
const auth = getAuth();
const user = await auth.getUser(uid);
await auth.setCustomUserClaims(uid, { ...user.customClaims, instructor: true });
console.log(
  "Instructor claim granted. The user must sign out and sign back in.",
);
