// Targeted live UI regression. Stdin is the authenticated CLI's API-key JSON.
// Uses a temporary account and a clearly labelled nonclinical fixture, never email.
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
let input='';for await(const chunk of process.stdin)input+=chunk;
const keys=JSON.parse(input);input='';
const key=keys.find(k=>k.name==='service_role')?.api_key||keys.find(k=>k.type==='secret')?.api_key;if(!key)throw Error('Admin key unavailable');
const origin='https://cidsimroom.web.app',url='https://qfghkzeifqhabxxdmabq.supabase.co';
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const check=r=>{if(r.error)throw Error(r.error.message);return r.data};
const email=`simroom-qa-${randomUUID()}@example.com`,password=randomUUID()+'Aa1!',caseId='qa-ui-'+randomUUID();
let uid,browser;
try{
 uid=check(await admin.auth.admin.createUser({email,password,email_confirm:true})).user.id;check(await admin.from('instructors').insert({user_id:uid}));
 const draft=structuredClone(check(await admin.from('scenarios').select('data').eq('id','pe').single()).data);
 draft.id=caseId;draft.title='Nonclinical phone fixture';draft.facultyPack={originalText:'Private fixture',debriefQuestions:'Private fixture question',exampleSBAR:'Private expected fixture answer'};
 draft.interventions=[{id:'fixture-rescue',name:'Nonclinical rescue fixture'}];
 draft.branches=[{id:'fixture-recovery',name:'Nonclinical recovery fixture',kind:'recovery',provenance:'faculty-authored',sourceNote:'Test only; no clinical profile authored',reviewed:true,conditions:{interventions:[{id:'fixture-rescue',state:'effective'}]},observations:{rr:11}}];
 draft.timeJumps=[{id:'fixture-jump',label:'Fixture thirty-minute jump',advanceMs:1800000,reviewed:true}];
 check(await admin.rpc('save_scenario',{p_draft:draft}));
 // Confirm the server rejects reviewed checklist physiology in faculty packs.
 const invalid=structuredClone(draft);invalid.stages[0].actions[0].response={reviewed:true,observations:{spo2:100}};
 const actor=createClient(url,'sb_publishable_whsCe6rdzgoUEhFhp2cUrw_5_XuiV8j',{auth:{persistSession:false,autoRefreshToken:false}});check(await actor.auth.signInWithPassword({email,password}));
 assert((await actor.functions.invoke('simroom',{body:{operation:'saveScenario',data:{scenario:invalid}}})).error);
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
 const phone=await browser.newContext({viewport:{width:390,height:844}}),screen=await browser.newContext({viewport:{width:1366,height:900}});
 const p=await phone.newPage(),m=await screen.newPage();p.setDefaultTimeout(60000);m.setDefaultTimeout(60000);p.on('dialog',d=>void d.accept());
 await p.goto(origin);await p.getByLabel('Email',{exact:true}).fill(email);await p.getByLabel('Password',{exact:true}).fill(password);await p.getByRole('button',{name:'Sign in',exact:true}).click();
 await p.locator('.case-card').filter({hasText:'Pulmonary embolism'}).first().getByRole('button',{name:'Start session',exact:true}).click();await p.getByRole('button',{name:'Connect monitor',exact:true}).click();await p.locator('.session-code').waitFor();
 await p.getByRole('button',{name:'Scenario library',exact:true}).click();await p.locator('.case-card').filter({hasText:'Nonclinical phone fixture'}).getByRole('button',{name:'Start session',exact:true}).click();
 assert.equal(await p.locator('.session-code').count(),0);await p.getByRole('button',{name:'Connect monitor',exact:true}).click();
 const code=(await p.locator('.session-code').innerText()).trim();await m.goto(origin+'/monitor?code='+code);await m.locator('.monitor').waitFor();
 await p.getByRole('button',{name:'prescribed',exact:true}).click();assert.equal(await m.locator('.numeric.yellow strong').innerText(),'22');
 await p.getByRole('button',{name:'performed',exact:true}).click();await p.getByRole('button',{name:'Confirm effective',exact:true}).click();await p.getByRole('button',{name:'Control',exact:true}).click();await p.getByRole('button',{name:'Select branch',exact:true}).click();
 await eventually(async()=>assert.equal(await m.locator('.numeric.yellow strong').innerText(),'11'));
 await p.getByRole('button',{name:'Start',exact:true}).click();await p.getByRole('button',{name:'Pause',exact:true}).click();await p.getByRole('button',{name:'Fixture thirty-minute jump · +30 min',exact:true}).click();
 await eventually(async()=>assert.match(await m.locator('.monitor-patient').innerText(),/30:/));assert.match(await m.locator('.monitor-patient').innerText(),/PAUSED/);
 await p.getByRole('button',{name:'Debrief',exact:true}).click();await p.getByRole('heading',{name:'Discussion questions',exact:true}).waitFor();
 for(const width of [375,390,430]){await p.setViewportSize({width,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
 await p.screenshot({path:'docs/screenshots/live-pack-fixture-debrief.png',fullPage:true});
 console.log('PASS live UI: new-session QR reset, separate prescription/delivery/effectiveness, confirmed recovery, paused thirty-minute jump, private debrief, 375/390/430px layout, and rejected checklist physiology. Nonclinical fixture only; four new packs remain missing.');
}finally{
 if(browser)await browser.close();
 if(uid){const sessions=check(await admin.from('sessions').select('id').eq('owner',uid)),members=sessions.length?check(await admin.from('monitor_members').select('user_id').in('session_id',sessions.map(s=>s.id))):[];
 if(sessions.length)check(await admin.from('sessions').delete().in('id',sessions.map(s=>s.id)));
 for(const id of new Set(members.map(m=>m.user_id))){if(id!==uid){const u=check(await admin.auth.admin.getUserById(id)).user;if(u.is_anonymous)check(await admin.auth.admin.deleteUser(id))}}
 check(await admin.auth.admin.deleteUser(uid));}
 check(await admin.from('scenario_versions').delete().eq('id',caseId));check(await admin.from('scenarios').delete().eq('id',caseId));
 console.log('Removed disposable live UI accounts and records.');
}
async function eventually(f){let last;for(let n=0;n<160;n++){try{return await f()}catch(e){last=e;await new Promise(r=>setTimeout(r,250))}}throw last}
