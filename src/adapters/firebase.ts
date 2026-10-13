import {onAuthStateChanged,signInWithEmailAndPassword,signInAnonymously,signOut} from 'firebase/auth';
import {collection,query,where,onSnapshot,doc} from 'firebase/firestore';
import {ref,uploadBytes} from 'firebase/storage';
import {auth,db,storage,call} from '../firebase';
import type {BackendAdapter,BackendUser} from '../backend';import type {Scenario,Session,MonitorState} from '../types';
let current:BackendUser|null=null;
export const adapter:BackendAdapter={
 currentUser:()=>current,
 watchAuth:callback=>onAuthStateChanged(auth,async u=>{current=u?{uid:u.uid,instructor:!!(await u.getIdTokenResult()).claims.instructor}:null;callback(current)}),
 signIn:async(email,password)=>{await signInWithEmailAndPassword(auth,email,password)},
 signOut:()=>signOut(auth),anonymous:async()=>{if(!auth.currentUser)await signInAnonymously(auth)},call:async<T>(name:string,data:unknown)=>{const result=await call<{accepted?:boolean;error?:string}>(name,data);if(result?.accepted===false)throw Error(result.error);return result as T},
 scenarios:(callback,error)=>onSnapshot(collection(db,'scenarios'),s=>callback(s.docs.map(d=>d.data() as Scenario)),error),
 sessions:(uid,callback,error)=>onSnapshot(query(collection(db,'sessions'),where('owner','==',uid)),s=>callback(s.docs.map(d=>({...d.data(),_id:d.id}) as unknown as Session)),error),
 session:(id,monitor,callback,error)=>onSnapshot(doc(db,monitor?'monitors':'sessions',id),{includeMetadataChanges:true},s=>{if(s.exists())callback(s.data() as Session|MonitorState,!s.metadata.fromCache&&navigator.onLine)},error),
 upload:async(path,file)=>{await uploadBytes(ref(storage,path),file)}
};
