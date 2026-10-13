import type {Scenario, Session, MonitorState} from './types';
export type BackendUser={uid:string;instructor:boolean};
export type BackendAdapter={
 currentUser:()=>BackendUser|null;
 watchAuth:(callback:(user:BackendUser|null)=>void)=>()=>void;
 signIn:(email:string,password:string)=>Promise<void>;
 signOut:()=>Promise<void>;
 signUp?:(email:string,password:string)=>Promise<boolean>;
 anonymous:()=>Promise<void>;
 call:<T>(name:string,data:unknown)=>Promise<T>;
 scenarios:(callback:(data:Scenario[])=>void,error:(e:Error)=>void)=>()=>void;
 sessions:(uid:string,callback:(data:Session[])=>void,error:(e:Error)=>void)=>()=>void;
 session:(id:string,monitor:boolean,callback:(data:Session|MonitorState,connected:boolean)=>void,error:(e:Error)=>void,connection:(connected:boolean)=>void)=>()=>void;
 upload:(path:string,file:File)=>Promise<void>;
};
const env=import.meta.env;
export const provider=env.VITE_BACKEND||'firebase';
export const emulator=env.VITE_USE_EMULATORS!=='false';
export const backendReady=provider==='supabase' ? !!(env.VITE_SUPABASE_URL&&env.VITE_SUPABASE_PUBLISHABLE_KEY)&&env.VITE_BACKEND_READY!=='false' : emulator||env.VITE_BACKEND_READY!=='false';
let current:BackendUser|null=null;
const adapter=()=>provider==='supabase'?import('./adapters/supabase').then(m=>m.adapter):import('./adapters/firebase').then(m=>m.adapter);
function subscribe(make:(a:BackendAdapter)=>()=>void,error:(e:Error)=>void){let closed=false,unsubscribe=()=>{};void adapter().then(a=>{if(!closed)unsubscribe=make(a)}).catch(e=>{if(!closed)error(e)});return()=>{closed=true;unsubscribe()}}
export const currentUser=()=>current;
export function watchAuth(callback:(u:BackendUser|null)=>void){if(!backendReady){callback(null);return()=>{}}return subscribe(a=>a.watchAuth(u=>{current=u;callback(u)}),()=>callback(null))}
export const signIn=async(email:string,password:string)=>(await adapter()).signIn(email,password);
export const logOut=async()=>(await adapter()).signOut();
export const signAnonymous=async()=>(await adapter()).anonymous();
export const call=async<T>(name:string,data:unknown):Promise<T>=>{if(!backendReady)throw Error('Workspace setup is incomplete');return (await adapter()).call<T>(name,data)};
export const watchScenarios=(callback:(s:Scenario[])=>void,error:(e:Error)=>void)=>subscribe(a=>a.scenarios(callback,error),error);
export const watchSessions=(uid:string,callback:(s:Session[])=>void,error:(e:Error)=>void)=>subscribe(a=>a.sessions(uid,callback,error),error);
export const watchSession=(id:string,monitor:boolean,callback:(s:Session|MonitorState,connected:boolean)=>void,error:(e:Error)=>void,connection:(c:boolean)=>void)=>subscribe(a=>a.session(id,monitor,callback,error,connection),error);
export const uploadAsset=async(path:string,file:File)=>(await adapter()).upload(path,file);

export const registerFaculty=async(email:string,password:string)=>{const a=await adapter();if(!a.signUp)throw Error("Account registration unavailable");return a.signUp(email,password)};
