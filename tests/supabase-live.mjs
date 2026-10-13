// Administrator keys arrive only through stdin from the authenticated CLI.
// Creates disposable accounts without sending email; removes all test data.
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
let input='';for await(const chunk of process.stdin)input+=chunk;
const keys=JSON.parse(input);input='';
const secret=keys.find(k=>k.name==='service_role')?.api_key||keys.find(k=>k.type==='secret')?.api_key;
if(!secret)throw Error('Administrator key unavailable');
const url='https://qfghkzeifqhabxxdmabq.supabase.co';
const pub='sb_publishable_whsCe6rdzgoUEhFhp2cUrw_5_XuiV8j';
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,secret,options),owner=createClient(url,pub,options),monitor=createClient(url,pub,options),stranger=createClient(url,pub,options);
const check=r=>{if(r.error)throw Error(r.error.message);return r.data};
const users=[],sessions=[];console.log('Checking deployed Supabase with disposable accounts.');let testScenario,asset;
const email=`simroom-qa-${randomUUID()}@example.com`,password=randomUUID()+'Aa1!';
const invoke=async(c,operation,data)=>{const r=await c.functions.invoke('simroom',{body:{operation,data}});if(r.error){let m=r.error.message;try{m=(await r.error.context.json()).message}catch{}throw Error(m)}return r.data};
try{
 const stale=check(await admin.auth.admin.listUsers()).users.filter(u=>u.email?.startsWith('simroom-qa-')&&u.email.endsWith('@example.com'));for(const u of stale)check(await admin.auth.admin.deleteUser(u.id));
 const u=check(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;users.push(u.id);
 check(await admin.from('instructors').insert({user_id:u.id}));
 check(await owner.auth.signInWithPassword({email,password}));
 for(const c of [monitor,stranger])users.push(check(await c.auth.signInAnonymously()).user.id);
 assert.equal(check(await owner.rpc('is_instructor')),true);console.log('Verified deployed authentication and faculty role.');
 if(!process.env.SIMROOM_BROWSER_ONLY){const cases=check(await owner.from('scenarios').select('id,data'));assert.equal(cases.length,3);assert(cases.every(c=>c.data.stages.length===4));
 for(const c of [monitor,stranger]){assert.deepEqual(check(await c.from('scenarios').select('*')),[]);assert.deepEqual(check(await c.from('source_archive').select('*')),[])}
 console.log('Verified source cases and private reads.');const {id,code}=await invoke(owner,'create',{scenario:'pe'});sessions.push(id);
 assert.equal((await invoke(monitor,'join',{code})).id,id);
 assert.deepEqual(check(await monitor.from('sessions').select('*')),[]);
 assert.deepEqual(check(await stranger.from('monitors').select('*')),[]);
 const command=(type,data={},cid=randomUUID())=>invoke(owner,'command',{session:id,command:{id:cid,type,...data}});
 const state=async()=>check(await owner.from('sessions').select('state').eq('id',id).single()).state;
 const display=async()=>check(await monitor.from('monitors').select('state').eq('id',id).single()).state;
 await assert.rejects(invoke(monitor,'command',{session:id,command:{id:randomUUID(),type:'stage',stage:2}}));
 assert((await monitor.from('monitors').update({state:{}}).eq('id',id)).error);
 assert((await owner.rpc('commit_session',{})).error);
 await command('stage',{stage:2});assert.equal((await display()).observations.spo2,86);
 assert.equal((await display()).scenario,undefined);assert.equal((await display()).actions,undefined);
 await command('override',{field:'spo2',value:91});await command('stage',{stage:3});assert.equal((await display()).observations.spo2,91);
 const s=await state(),action=s.scenario.stages.flatMap(x=>x.actions).find(a=>/SBAR/i.test(a.label||a.text));assert(action);
 await command('action',{action:action.id,answer:'notyet'});await command('prompt',{action:action.id});
 const cid=randomUUID();await command('action',{action:action.id,answer:'yes'},cid);const rev=(await state()).revision;await command('action',{action:action.id,answer:'yes'},cid);assert.equal((await state()).revision,rev);assert.equal((await display()).observations.spo2,91);
 console.log('Verified controls, overrides and recorded actions.');await command('start');await command('pause');const paused=await display();await command('tick');assert.equal((await display()).elapsed,paused.elapsed);await command('resume');assert.equal((await display()).status,'running');
 const draft=structuredClone(cases.find(c=>c.id==='pe').data);draft.id='qa-'+randomUUID();draft.title='QA permission fixture';testScenario=draft.id;
 asset=`${u.id}/qa-${randomUUID()}.svg`;check(await owner.storage.from('investigations').upload(asset,new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><text>Nonclinical permission fixture</text></svg>'],{type:'image/svg+xml'})));
 draft.investigations[0].assetPath='investigations/'+asset;
  draft.facultyPack={originalText:'Private synthetic pack fixture',exampleSBAR:'Private expected answer',debriefQuestions:'Private fixture discussion question'};
  draft.interventions=[{id:'fixture-rescue',name:'Nonclinical rescue fixture'}];
  draft.branches=[{id:'fixture-recovery',name:'Nonclinical recovery fixture',kind:'recovery',reviewed:true,provenance:'faculty-authored',sourceNote:'Test fixture, not an imported clinical profile',conditions:{interventions:[{id:'fixture-rescue',state:'effective'}]},observations:{rr:11}}];
  draft.timeJumps=[{id:'fixture-30min',label:'Nonclinical time jump',advanceMs:1800000,reviewed:true}];
 await invoke(owner,'saveScenario',{scenario:draft});const created=await invoke(owner,'create',{scenario:draft.id});sessions.push(created.id);await invoke(monitor,'join',{code:created.code});
 const investigation=draft.investigations[0].id;
 await assert.rejects(invoke(monitor,'asset',{session:created.id,investigation}));
 assert((await monitor.storage.from('investigations').download(asset)).error);
 await invoke(owner,'command',{session:created.id,command:{id:randomUUID(),type:'investigation',investigation,state:'requested'}});
 await invoke(owner,'command',{session:created.id,command:{id:randomUUID(),type:'investigation',investigation,state:'released'}});
 assert((await invoke(monitor,'asset',{session:created.id,investigation})).data);
 await assert.rejects(invoke(stranger,'asset',{session:created.id,investigation}));
  const fixtureCommand=(type,data={})=>invoke(owner,'command',{session:created.id,command:{id:randomUUID(),type,...data}});
  await assert.rejects(fixtureCommand('branch',{branch:'fixture-recovery',confirmed:true}));
  await fixtureCommand('intervention',{intervention:'fixture-rescue',state:'prescribed'});
  await assert.rejects(fixtureCommand('intervention',{intervention:'fixture-rescue',state:'effective',confirmed:true}));
  await fixtureCommand('intervention',{intervention:'fixture-rescue',state:'performed'});
  await fixtureCommand('intervention',{intervention:'fixture-rescue',state:'effective',confirmed:true});
  await fixtureCommand('branch',{branch:'fixture-recovery',confirmed:true});
  const publicFixture=check(await monitor.from('monitors').select('state').eq('id',created.id).single()).state;
  assert.equal(publicFixture.observations.rr,11);assert.equal(publicFixture.facultyPack,undefined);assert.equal(publicFixture.interventions,undefined);assert.equal(publicFixture.branch,undefined);
  await fixtureCommand('start');await fixtureCommand('pause');await fixtureCommand('timeJump',{jump:'fixture-30min',confirmed:true});
  assert(check(await owner.from('sessions').select('state').eq('id',created.id).single()).state.elapsed>=1800000);
  await assert.rejects(invoke(monitor,'command',{session:created.id,command:{id:randomUUID(),type:'timeJump',jump:'fixture-30min',confirmed:true}}));
  draft.investigations[0].report='Supplied synthetic text fixture: exact µg token preserved; no diagnostic image.';
  draft.investigations[0].releaseOnRequest=true;
  await invoke(owner,'saveScenario',{scenario:draft});assert.equal(check(await owner.from('sessions').select('state').eq('id',created.id).single()).state.scenario.version,1);
  const textSession=await invoke(owner,'create',{scenario:draft.id});sessions.push(textSession.id);await invoke(monitor,'join',{code:textSession.code});
  await assert.rejects(invoke(monitor,'asset',{session:textSession.id,investigation}));
  await invoke(owner,'command',{session:textSession.id,command:{id:randomUUID(),type:'investigation',investigation,state:'requested'}});
  const supplied=await invoke(monitor,'asset',{session:textSession.id,investigation});assert.equal(Buffer.from(supplied.data,'base64').toString('utf8'),draft.investigations[0].report);
  await assert.rejects(invoke(stranger,'asset',{session:textSession.id,investigation}));
 console.log('PASS deployed Supabase: Auth, source cases, owner/monitor restrictions, stage values, pinned override, action/prompt/retries, pause/resume, version snapshots and private investigation release.');}
 if(process.env.SIMROOM_LIVE_BROWSER){
  const {chromium}=await import('playwright');const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
  try{
   const phone=await browser.newContext({viewport:{width:390,height:844}}),screen=await browser.newContext({viewport:{width:1366,height:900}});
   const p=await phone.newPage(),m=await screen.newPage();p.setDefaultTimeout(60000);m.setDefaultTimeout(60000);let realtimeEvents=0;const frameTypes={};m.on('websocket',ws=>ws.on('framereceived',frame=>{try{const v=JSON.parse(String(frame.payload)),event=Array.isArray(v)?v[3]:v.event;frameTypes[event]=(frameTypes[event]||0)+1;if(event==='postgres_changes')realtimeEvents++}catch{}}));await p.goto(process.env.SIMROOM_LIVE_BROWSER);
   await p.getByLabel('Email',{exact:true}).fill(email);await p.getByLabel('Password',{exact:true}).fill(password);await p.getByRole('button',{name:'Sign in',exact:true}).click();
   await p.locator('.case-card').filter({hasText:'Pulmonary embolism'}).first().getByRole('button',{name:'Start session'}).click();await p.getByRole('button',{name:'Connect monitor'}).click();
   const code=(await p.locator('.session-code').innerText()).trim();await m.goto(process.env.SIMROOM_LIVE_BROWSER+'/monitor?code='+code);await m.locator('.monitor').waitFor();
   await assertEventually(async()=>assert.equal(await m.locator('.numeric.cyan strong').innerText(),'92'));
   await p.getByRole('button',{name:'Control',exact:true}).click();await p.locator('.stage-buttons button').nth(2).click();
   await assertEventually(async()=>assert.equal(await m.locator('.numeric.cyan strong').innerText(),'86'));
   const form=p.locator('.override-grid form').filter({hasText:'SPO2'});await form.locator('input').fill('91');await form.getByRole('button',{name:'Apply & pin'}).click();await p.locator('.stage-buttons button').nth(3).click();
   await assertEventually(async()=>assert.equal(await m.locator('.numeric.cyan strong').innerText(),'91'));
   await p.getByRole('button',{name:'Start',exact:true}).click();await p.getByRole('button',{name:'Pause',exact:true}).click();await assertEventually(async()=>assert.match(await m.locator('.monitor-patient').innerText(),/PAUSED/));
   await screen.setOffline(true);await assertEventually(async()=>assert.match(await m.locator('.status').innerText(),/STALE/));await screen.setOffline(false);await assertEventually(async()=>assert.match(await m.locator('.status').innerText(),/LIVE CONNECTION/));
   await p.getByRole('button',{name:'Resume',exact:true}).click();await assertEventually(async()=>assert.match(await m.locator('.monitor-patient').innerText(),/RUNNING/));
   await p.getByLabel('Device',{exact:true}).fill('Fixture oxygen device');await p.getByLabel('Flow (L/min; leave blank if unspecified)').fill('6');await p.getByRole('button',{name:'Apply & pin delivery',exact:true}).click();await p.locator('.stage-buttons button').nth(0).click();
   await assertEventually(async()=>assert.match(await m.locator('.monitor-footer').innerText(),/Fixture oxygen device at 6 L\/min/));
   await p.getByLabel('Assisted ventilation in progress').check();await p.getByLabel('Assisted rate (/min; leave blank if unspecified)').fill('12');await p.getByRole('button',{name:'Record ventilation',exact:true}).click();
   await assertEventually(async()=>assert.match(await m.locator('.monitor-footer').innerText(),/Assisted ventilation · 12\/min/));assert.equal(await m.locator('.numeric.yellow strong').innerText(),'22');
   for(const section of ['Briefing','History','Findings','Investigations','Checklist']){await p.getByRole('button',{name:section,exact:true}).click();}
   for(const width of [375,390,430]){await p.setViewportSize({width,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   await p.getByRole('button',{name:'Control',exact:true}).click();
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));console.log('Realtime frame types:',JSON.stringify(frameTypes));assert(realtimeEvents>0,'Expected a real Supabase Realtime monitor event');
   await p.screenshot({path:'docs/screenshots/live-controller.png',fullPage:true});await m.screenshot({path:'docs/screenshots/live-monitor.png',fullPage:true});
   console.log('PASS deployed Chromium separate phone/monitor contexts: live updates, stage values, pins, pause/resume, offline/reconnect and phone layout. Physical devices remain untested.');
   if(!process.env.SIMROOM_BROWSER_ONLY){
    p.on('dialog',dialog=>void dialog.accept());await p.getByRole('button',{name:'Scenario library',exact:true}).click();await p.locator('.case-card').filter({hasText:'QA permission fixture'}).getByRole('button',{name:'Start session',exact:true}).click();await p.getByRole('button',{name:'Connect monitor',exact:true}).click();
    const fixtureCode=(await p.locator('.session-code').innerText()).trim();await m.goto(process.env.SIMROOM_LIVE_BROWSER+'/monitor?code='+fixtureCode);await m.locator('.monitor').waitFor();
    await p.getByRole('button',{name:'prescribed',exact:true}).click();await assertEventually(async()=>assert.equal(await m.locator('.numeric.yellow strong').innerText(),'22'));
    await p.getByRole('button',{name:'performed',exact:true}).click();await p.getByRole('button',{name:'Confirm effective',exact:true}).click();await p.getByRole('button',{name:'Control',exact:true}).click();await p.getByRole('button',{name:'Select branch',exact:true}).click();
    await assertEventually(async()=>assert.equal(await m.locator('.numeric.yellow strong').innerText(),'11'));
    await p.getByRole('button',{name:'Start',exact:true}).click();await p.getByRole('button',{name:'Pause',exact:true}).click();await p.getByRole('button',{name:'Nonclinical time jump · +30 min',exact:true}).click();
    await assertEventually(async()=>assert.match(await m.locator('.monitor-patient').innerText(),/30:/));assert.match(await m.locator('.monitor-patient').innerText(),/PAUSED/);
    await p.getByRole('button',{name:'Debrief',exact:true}).click();await p.getByRole('heading',{name:'Discussion questions',exact:true}).waitFor();await p.screenshot({path:'docs/screenshots/live-pack-fixture-debrief.png',fullPage:true});
    console.log('PASS deployed nonclinical pack UI fixture: separate delivery/effectiveness, confirmed branch, paused time jump and private debrief.');
   }
  }finally{await browser.close()}
 }
}finally{
 // Remove only this disposable owner’s sessions, assets, scenarios and accounts.
 const owned=(await admin.from('sessions').select('id').eq('owner',users[0]||'00000000-0000-0000-0000-000000000000')).data||[];if(owned.length){const members=check(await admin.from('monitor_members').select('user_id').in('session_id',owned.map(s=>s.id)));for(const m of members){if(!users.includes(m.user_id)){const u=check(await admin.auth.admin.getUserById(m.user_id)).user;if(u.is_anonymous)users.push(m.user_id)}}check(await admin.from('sessions').delete().in('id',owned.map(s=>s.id)))}
 if(asset)check(await admin.storage.from('investigations').remove([asset]));
 if(testScenario){check(await admin.from('scenario_versions').delete().eq('id',testScenario));check(await admin.from('scenarios').delete().eq('id',testScenario))}
 for(const id of users)check(await admin.auth.admin.deleteUser(id));
 console.log('Disposable deployed test data removed.');
}
async function assertEventually(f){let last;for(let n=0;n<120;n++){try{return await f()}catch(e){last=e;await new Promise(r=>setTimeout(r,250))}}throw last}
