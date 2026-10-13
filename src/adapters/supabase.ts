import {createClient,type SupabaseClient,type User} from '@supabase/supabase-js';
import type {BackendAdapter,BackendUser} from '../backend';import type {Scenario,Session,MonitorState} from '../types';
let client:SupabaseClient|undefined,current:BackendUser|null=null,anon:Promise<void>|null=null;
const get=()=>client??=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const fail=(error:unknown)=>{if(error)throw Error((error as {message:string}).message)};
function watch(table:string,filter:{column:string;value:string}|null,callback:(rows:Record<string,unknown>[],connected:boolean)=>void,error:(e:Error)=>void,connection:(c:boolean)=>void=()=>{}){
 const s=get();let closed=false,fetching=false,again=false,subscription=false;
 const fetchRows=async()=>{if(closed)return;if(fetching){again=true;return}fetching=true;try{let query=s.from(table).select(table==='sessions'?'id,state,owner':table==='scenarios'?'id,data':'id,state');if(filter)query=query.eq(filter.column,filter.value);const result=await query;fail(result.error);if(!closed){callback((result.data||[]) as unknown as Record<string,unknown>[],navigator.onLine);connection(navigator.onLine)}}catch(e){if(!closed){connection(false);if(navigator.onLine)error(e as Error)}}finally{fetching=false;if(again){again=false;void fetchRows()}}};
 const channel=s.channel(`${table}-${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table,...(filter?{filter:`${filter.column}=eq.${filter.value}`}:{})},()=>void fetchRows()).subscribe(status=>{subscription=status==='SUBSCRIBED';if(subscription)void fetchRows();else connection(false)});
 const online=()=>void fetchRows(),offline=()=>connection(false),visible=()=>{if(document.visibilityState==='visible')void fetchRows()};window.addEventListener('online',online);window.addEventListener('offline',offline);document.addEventListener('visibilitychange',visible);const timer=setInterval(()=>{if(!subscription&&navigator.onLine)void fetchRows()},5000);void fetchRows();return()=>{closed=true;clearInterval(timer);window.removeEventListener('online',online);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',visible);void s.removeChannel(channel)};
}
export const adapter:BackendAdapter={
 currentUser:()=>current,
 watchAuth:callback=>{let active=true,serial=0;const load=async(u:User|null)=>{const ticket=++serial;let instructor=false;if(u){const result=await get().rpc('is_instructor');instructor=result.data===true&&!result.error}if(active&&ticket===serial){current=u?{uid:u.id,instructor}:null;callback(current)}};const {data}=get().auth.onAuthStateChange((_event,session)=>{queueMicrotask(()=>void load(session?.user||null))});void get().auth.getSession().then(r=>void load(r.data.session?.user||null));return()=>{active=false;data.subscription.unsubscribe()}},
 signIn:async(email,password)=>{const r=await get().auth.signInWithPassword({email,password});fail(r.error)},
 signUp:async(email,password)=>{const r=await get().auth.signUp({email,password,options:{emailRedirectTo:location.origin}});fail(r.error);return !!r.data.session},
 signOut:async()=>{const r=await get().auth.signOut();fail(r.error);current=null},
 anonymous:async()=>{if(!anon)anon=(async()=>{const session=await get().auth.getSession();if(!session.data.session){const r=await get().auth.signInAnonymously();fail(r.error)}})().finally(()=>{anon=null});await anon},
 call:async<T>(name:string,data:unknown):Promise<T>=>{const r=await get().functions.invoke('simroom',{body:{operation:name,data}});if(r.error){let message=r.error.message;try{message=(await r.error.context?.json())?.message||message}catch{}throw Error(message)}return r.data as T},
 scenarios:(callback,error)=>watch('scenarios',null,rows=>callback(rows.map(r=>r.data as Scenario)),error),
 sessions:(uid,callback,error)=>watch('sessions',{column:'owner',value:uid},rows=>callback(rows.map(r=>({...r.state as Session,_id:r.id}) as Session)),error),
 session:(id,monitor,callback,error,connection)=>watch(monitor?'monitors':'sessions',{column:'id',value:id},(rows,connected)=>{if(rows[0])callback(rows[0].state as Session|MonitorState,connected);else{connection(false);error(Error('Session access unavailable'))}},error,connection),
 upload:async(path,file)=>{const r=await get().storage.from('investigations').upload(path.replace(/^investigations\//,''),file,{contentType:file.type,upsert:false});fail(r.error)}
};
