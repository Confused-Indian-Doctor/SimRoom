import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";
const e = import.meta.env;
export const emulator = e.VITE_USE_EMULATORS !== "false";
export const backendReady = emulator || e.VITE_BACKEND_READY !== "false";
const app = initializeApp({
  appId: e.VITE_FIREBASE_APP_ID,
  messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: e.VITE_FIREBASE_MEASUREMENT_ID,
  apiKey: e.VITE_FIREBASE_API_KEY || "demo-key",
  authDomain: e.VITE_FIREBASE_AUTH_DOMAIN || "demo-simroom.firebaseapp.com",
  projectId: e.VITE_FIREBASE_PROJECT_ID || "demo-simroom",
  storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET || "demo-simroom.appspot.com",
});
export const auth = getAuth(app),
  db = getFirestore(app),
  functions = getFunctions(app),
  storage = getStorage(app);
if (emulator) {
  const host = e.VITE_EMULATOR_HOST || location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
  connectStorageEmulator(storage, host, 9199);
}
export async function call<T>(name: string, data: unknown) {
  return (await httpsCallable<unknown, T>(functions, name)(data)).data;
}
