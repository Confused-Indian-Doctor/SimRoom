/** Pure, authored simulation state. No clinical kinetics or inferred treatment responses. */
export const observationUnits={hr:'bpm',spo2:'%',sbp:'mmHg',dbp:'mmHg',rr:'/min',temp:'°C'};
export const mechanismSpecs={
 'airway.patency':{label:'Airway patency',choices:['patent','partially obstructed','obstructed']},
 'airway.reflexes':{label:'Protective reflexes',choices:['present','reduced','absent']},
 'ventilation.depth':{label:'Spontaneous breathing depth',choices:['normal','shallow','deep','absent']},
 'ventilation.effort':{label:'Respiratory effort',choices:['normal','increased','reduced','absent']},
 'ventilation.co2':{label:'CO₂ / ventilation context',unit:'kPa',min:0,max:30},
 'oxygenation.context':{label:'Oxygenation context',choices:['adequate','impaired','severely impaired']},
 'electrical.rhythm':{label:'Electrical rhythm',choices:['sinus','vf','asystole']},
 'circulation.pulse':{label:'Perfusing pulse',choices:['present','weak','absent']},
 'circulation.perfusion':{label:'Perfusion',choices:['normal','poor','absent']},
 'consciousness.eyes':{label:'GCS eyes',unit:'score',min:1,max:4,integer:true},
 'consciousness.verbal':{label:'GCS verbal',unit:'score',min:1,max:5,integer:true},
 'consciousness.motor':{label:'GCS motor',unit:'score',min:1,max:6,integer:true},
 'consciousness.description':{label:'Consciousness',text:true},
 'symptoms.pain':{label:'Pain',unit:'/10',min:0,max:10},
 'symptoms.nausea':{label:'Nausea',choices:['none','present','severe']},
 'symptoms.distress':{label:'Distress',choices:['none','present','severe']},
 'metabolic.glucose':{label:'Glucose',unit:'mmol/L',min:0,max:60},
 'renal.context':{label:'Renal context / drug accumulation qualification',text:true},
 'disease.severity':{label:'Authored disease severity',unit:'fraction',min:0,max:1},
 'disease.description':{label:'Underlying disease process',text:true},
 'device.chestDrain':{label:'Chest drain function',choices:['not present','functioning','blocked','disconnected']},
};
const obsLimits={hr:[0,300],spo2:[0,100],sbp:[0,300],dbp:[0,200],rr:[0,100],temp:[0,45]};
export const lifecycle=['considered','requested','prescribed','prepared','administered','performed','effective','reassessed'];
const clone=v=>structuredClone(v);
export const simTime=(s,wall)=>s.elapsed+(s.status==='running'?Math.max(0,wall-s.anchor):0);
export function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v)}
export function validateTarget(path,value,unit,allowNull=false){
 if(value===null&&allowNull)return;
 const spec=mechanismSpecs[path];
 if(obsLimits[path]){if(typeof value!=='number'||!Number.isFinite(value)||value<obsLimits[path][0]||value>obsLimits[path][1])throw Error(`Invalid ${path}`);if(unit!=null&&unit!==observationUnits[path])throw Error(`Use ${observationUnits[path]} for ${path}`);return;}
 if(!spec)throw Error(`Unsupported patient mechanism: ${path}`);
 if(spec.choices&&!spec.choices.includes(value))throw Error(`Invalid ${spec.label}`);
 if(spec.text&&(typeof value!=='string'||value.length>2000))throw Error(`Invalid ${spec.label}`);
 if(spec.unit&&(typeof value!=='number'||!Number.isFinite(value)||value<spec.min||value>spec.max||spec.integer&&!Number.isInteger(value)))throw Error(`Invalid ${spec.label}`);
 if(spec.unit&&unit!=null&&unit!==spec.unit)throw Error(`Use ${spec.unit} for ${spec.label}`);
}
function log(s,type,label,at,extra={}){s.engine.eventSequence++;s.events.push({id:`engine:${s.engine.eventSequence}`,at,type,label,stage:s.stage,...extra})}
function snapshot(s){const result={};for(const k of ['stage','stageAt','status','elapsed','anchor','observations','pins','ramp','oxygen','oxygenDevice','oxygenFlow','oxygenPinned','rhythm','rhythmPinned','perfusion','signalQuality','signalPinned','ventilation','actions','interventions','investigations','mode','branch','branchAt','confirmed','activeRuleTargets','appliedRules','appliedBranches','timeJumps','revision','updatedAt','alarmAck'])if(s[k]!==undefined)result[k]=clone(s[k]);result.engine=clone({...s.engine,commands:[],ids:{},checkpoints:[],origin:null});return result;}
export function initialiseDomains(s,wall){
 if(s.engine)return s;
 const at=simTime(s,wall);
 const mechanisms=Object.fromEntries(Object.keys(mechanismSpecs).map(k=>[k,null]));Object.assign(mechanisms,s.scenario.patientBaseline||{});if(mechanisms['electrical.rhythm']==null)mechanisms['electrical.rhythm']=s.rhythm;
 s.engine={version:2,eventSequence:0,patient:{base:{...s.observations},mechanisms,pins:{},owners:{}},measurements:{sensors:Object.fromEntries(['ecg','spo2','rr','temp','nibp'].map(k=>[k,{attached:true,quality:'clean',status:'available',at,value:k==='nibp'?{sbp:s.observations.sbp,dbp:s.observations.dbp}:s.observations[k==='ecg'?'hr':k]}])),results:[]},learners:{records:Object.fromEntries(Object.entries(s.actions).map(([id,a])=>[id,{answer:a,everCompleted:a==='yes',prompted:false,notes:[],history:[]}])) ,medications:[],unsupported:[]},teaching:{enabledBranches:[],outcome:null},scheduler:{at,queue:[],effects:[],runs:{}},session:{seed:s.scenario.variation?.seed??1,randomState:(s.scenario.variation?.seed??1)||1,sequence:0,lastWall:wall,connections:{}},commands:[],ids:{},checkpoints:[],origin:null,baselineEventCount:s.events.length};
 if(s.scenario.variation?.enabled){for(const r of s.scenario.variation.ranges||[]){let x=s.engine.session.randomState>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;s.engine.session.randomState=x>>>0;let v=r.min+(r.max-r.min)*(x>>>0)/4294967296;if(mechanismSpecs[r.path]?.integer)v=Math.round(v);if(r.path in observationUnits)s.engine.patient.base[r.path]=v;else s.engine.patient.mechanisms[r.path]=v;}syncPatient(s,at);refreshMeasurements(s,at);log(s,'variation','Reviewed authored variation applied with recorded seed '+s.engine.session.seed,at);s.engine.baselineEventCount=s.events.length;}
 s.engine.origin=snapshot(s);return s;
}
export function checkpoint(s,id,label,wall){const at=simTime(s,wall);const snap=snapshot(s);snap.elapsed=at;snap.anchor=wall;const c={id,label,at,sequence:s.engine.session.sequence,eventCount:s.events.length,state:snap};s.engine.checkpoints.push(c);if(s.engine.checkpoints.length>8)s.engine.checkpoints.shift();log(s,'checkpoint',`Checkpoint: ${label}`,at);return c;}
function patientValue(s,path,at){return resolvePatient(s,at)[path]}
export function conditionMet(c,s,at){
 if(c.kind==='stage')return s.scenario.stages[s.stage]?.id===c.id;
 if(c.kind==='action')return s.actions[c.id]==='yes';
 if(c.kind==='effective')return s.interventions?.[c.id]?.effective===true;
 if(c.kind==='intervention')return s.interventions?.[c.id]?.[c.state]===true;
 if(c.kind==='time')return at-(c.clock==='session'?0:c.clock==='branch'?(s.branchAt??s.stageAt):s.stageAt)>=c.afterMs;
 if(c.kind==='confirmation')return s.confirmed===true;
 if(c.kind==='result')return s.engine.measurements.results.some(r=>r.investigation===c.id&&r.availableAt!=null&&r.availableAt<=at);
 if(c.kind==='threshold'){const value=patientValue(s,c.path,at);return value!=null&&({lt:()=>value<c.value,lte:()=>value<=c.value,gt:()=>value>c.value,gte:()=>value>=c.value,eq:()=>value===c.value,neq:()=>value!==c.value}[c.operator]?.()||false)}
 if(c.kind==='not')return !conditionMet(c.condition,s,at);
 return false;
}
function matches(conditions,match,s,at){if(!conditions?.length)return true;return match==='any'?conditions.some(c=>conditionMet(c,s,at)):conditions.every(c=>conditionMet(c,s,at));}
function queue(s,item){if(s.engine.scheduler.queue.length>=512)throw Error('Too many pending simulation events');s.engine.scheduler.queue.push(item);s.engine.scheduler.queue.sort((a,b)=>a.at-b.at||(b.priority||0)-(a.priority||0)||a.id.localeCompare(b.id));}
export function resolvePatient(s,at){
 const e=s.engine;if(!e)return {...s.observations};
 const result={...e.patient.base,...e.patient.mechanisms},owners={};
 const effects=e.scheduler.effects.filter(x=>x.at<=at&&x.active!==false);
 for(const path of new Set(effects.flatMap(x=>Object.keys(x.targets||{})))){
  const sets=effects.filter(x=>x.mode!=='delta'&&path in x.targets).sort((a,b)=>b.priority-a.priority||b.at-a.at||a.id.localeCompare(b.id));
  let value=result[path];
  if(sets[0]){const x=sets[0],p=x.responseMs?Math.min(1,Math.max(0,(at-x.at)/x.responseMs)):1;value=typeof x.targets[path]==='number'&&typeof x.from[path]==='number'?x.from[path]+(x.targets[path]-x.from[path])*p*x.effectiveness:p===1&&x.effectiveness===1?x.targets[path]:x.from[path];owners[path]=`model:${x.model}`;}
  for(const x of effects.filter(x=>x.mode==='delta'&&path in x.targets)){const p=x.responseMs?Math.min(1,Math.max(0,(at-x.at)/x.responseMs)):1;value=(typeof value==='number'?value:0)+x.targets[path]*p*x.effectiveness;owners[path]=`additive models`;}
  const spec=mechanismSpecs[path];if(spec?.integer&&typeof value==='number')value=Math.round(value);
  if(obsLimits[path]&&typeof value==='number')value=Math.max(obsLimits[path][0],Math.min(obsLimits[path][1],value));
  if(spec?.unit&&typeof value==='number')value=Math.max(spec.min,Math.min(spec.max,value));result[path]=typeof value==='number'?+value.toFixed(3):value;
 }
 for(const [path,value] of Object.entries(e.patient.pins)){result[path]=value;owners[path]='faculty override';}
 for(const k of Object.keys(s.pins||{}))if(s.pins[k]){result[k]=s.observations[k];owners[k]='faculty override';}
 e.patient.owners=owners;return result;
}
function startModel(s,definition,at,id,effectiveness=1){
 if(definition.reviewed!==true)throw Error('Treatment model requires clinical review');
 const from=resolvePatient(s,at),effect={id,model:definition.id,name:definition.name,kind:definition.kind||'treatment',at,targets:clone(definition.targets||{}),from,mode:definition.mode||'set',priority:definition.priority||0,responseMs:definition.responseMs||0,effectiveness,active:true};
 s.engine.scheduler.effects.push(effect);log(s,'effect',`${definition.name}: authored simulation effect started${effectiveness!==1?' · partial effectiveness '+effectiveness:''}`,at,{model:definition.id,targets:effect.targets});
 if(definition.durationMs!=null)queue(s,{id:id+':expire',kind:'expire',at:at+definition.durationMs,model:definition.id,effect:id,priority:definition.priority||0});
}
function stopEffect(s,effect,at,reason){effect.active=false;log(s,'effect',`${effect.name}: ${reason}`,at,{model:effect.model});}
function setBase(s,targets){for(const [k,v] of Object.entries(targets||{})){validateTarget(k,v);if(k in observationUnits)s.engine.patient.base[k]=v;else s.engine.patient.mechanisms[k]=v;}}
export function scheduleModel(s,model,at,source,effectiveness=1){
 if(model.requireConfirmation!==false&&!s.confirmed && source.confirmed!==true)throw Error('Faculty confirmation required for this authored model');
 if(model.kind==='treatment' && model.intervention && !s.interventions?.[model.intervention]?.effective)throw Error('Confirm the delivered intervention is effective first');
 const runs=s.engine.scheduler.runs[model.id]||{count:0,lastAt:null};const max=model.repeat?.maxRuns??1,cooldown=model.repeat?.cooldownMs??0;
 if(runs.count>=max || runs.lastAt!=null&&at-runs.lastAt<cooldown)return false;
 runs.count++;runs.lastAt=at;s.engine.scheduler.runs[model.id]=runs;
 const id=`model:${model.id}:${runs.count}`;
 queue(s,{id,kind:'onset',model:model.id,at:at+(model.onsetMs||0),priority:model.priority||0,effectiveness});
 log(s,'scheduled',`${model.name}: onset scheduled at ${(at+(model.onsetMs||0))/1000}s · ${model.explanation}`,at,{model:model.id});return true;
}
function acquire(s,result,at){
 const item=s.scenario.investigations.find(i=>i.id===result.investigation);if(!item)return;
 result.acquiredAt=at;result.processedWallAt=s.engine.session.processingWall??s.updatedAt;result.snapshot={observations:Object.fromEntries(Object.keys(observationUnits).map(k=>[k,resolvePatient(s,at)[k]])),mechanisms:Object.fromEntries(Object.keys(mechanismSpecs).map(k=>[k,resolvePatient(s,at)[k]])),oxygen:{device:s.oxygenDevice??s.oxygen,flow:s.oxygenFlow??null,description:s.oxygen},ventilation:clone(s.ventilation)};
 const report=(item.reportVariants||[]).find(v=>v.reviewed&&matches(v.conditions,v.match,s,at))?.report??item.report;
 result.report=report||null;result.assetPath=item.assetPath||null;result.status='acquired';
 log(s,'sample',`${item.name}: acquired · oxygen context preserved`,at,{instance:result.id});
 if(!report&&!item.assetPath){result.status='unavailable';result.unavailableReason='No approved report or asset supplied';return;}
 if(item.availabilityDelayMs){queue(s,{id:result.id+':available',kind:'result',instance:result.id,at:at+item.availabilityDelayMs});result.status='pending';}
 else{result.availableAt=at;result.status='available';log(s,'result',`${item.name}: available`,at,{instance:result.id});}
}
function eventDue(s,item,at){
 if(item.kind==='onset'){const d=s.scenario.models?.find(m=>m.id===item.model);if(d){if(matches(d.cancelWhen,'any',s,at)&&d.cancelWhen?.length){log(s,'cancelled',`${d.name}: pending onset cancelled by configured conditions`,at);return;}startModel(s,d,at,item.id,item.effectiveness);}}
 else if(item.kind==='expire'){
  const effect=s.engine.scheduler.effects.find(e=>e.id===item.effect);if(!effect?.active)return;const d=s.scenario.models?.find(m=>m.id===item.model);stopEffect(s,effect,at,'authored duration ended');
  if(d?.wearOffTargets){setBase(s,d.wearOffTargets);log(s,'effect',`${d.name}: authored wear-off / recurrence observations applied`,at,{targets:d.wearOffTargets});}
  for(const [i,r] of (d?.recurrence||[]).entries())queue(s,{id:item.id+':recurrence:'+i,kind:'recurrence',at:at+r.delayMs,model:item.model,targets:r.targets,priority:d.priority||0,explanation:r.explanation});
 }
 else if(item.kind==='recurrence'){setBase(s,item.targets);log(s,'recurrence',item.explanation,at,{model:item.model,targets:item.targets});}
 else if(item.kind==='result'){const r=s.engine.measurements.results.find(r=>r.id===item.instance);if(r){r.availableAt=at;r.status='available';log(s,'result','Investigation available',at,{instance:r.id});}}
 else if(item.kind==='cuff'){const sensor=s.engine.measurements.sensors.nibp;if(!sensor.attached||sensor.quality==='lost'){sensor.status='failed';log(s,'measurement','NIBP acquisition failed',at);return;}const p=resolvePatient(s,at);sensor.value={sbp:p.sbp,dbp:p.dbp};sensor.at=at;sensor.processedWallAt=s.engine.session.processingWall??s.updatedAt;sensor.status='available';log(s,'measurement','NIBP cuff reading acquired',at,{observations:{sbp:p.sbp,dbp:p.dbp}});}
 else if(item.kind==='rule')applyScheduledRule(s,item,at);
}
function applyScheduledRule(s,item,at){
 const r=s.scenario.schedulerRules?.find(r=>r.id===item.rule);if(!r)return;
 if(r.cancelWhen?.length&&matches(r.cancelWhen,'any',s,at)){log(s,'cancelled',`${r.name}: queued response cancelled`,at);return;}
 for(const effect of r.effects){
  if(effect.kind==='targets'){
   const d={id:'rule-'+r.id,name:r.name,kind:'disease',reviewed:true,targets:effect.targets,responseMs:r.responseMs||0,priority:r.priority||0,mode:effect.mode||'set'};
   if(d.responseMs||d.mode==='delta')startModel(s,d,at,item.id+':targets');else setBase(s,effect.targets);
  }else if(effect.kind==='startModel'){const m=s.scenario.models?.find(m=>m.id===effect.id);if(m)scheduleModel(s,m,at,{confirmed:item.confirmed},1);}
  else if(effect.kind==='stopModel'){for(const e of s.engine.scheduler.effects.filter(e=>e.model===effect.id&&e.active))stopEffect(s,e,at,'stopped by authored rule');}
  else if(effect.kind==='cue')log(s,'cue',effect.text,at);
  else if(effect.kind==='enableBranch'){if(!s.engine.teaching.enabledBranches.includes(effect.id))s.engine.teaching.enabledBranches.push(effect.id);}
  else if(effect.kind==='stage'){const index=s.scenario.stages.findIndex(st=>st.id===effect.id);if(index>=0){s.stage=index;s.stageAt=at;s.branch=null;s.confirmed=false;}}
  else if(effect.kind==='end'){s.status='ended';s.elapsed=at;s.engine.teaching.outcome=effect.outcome;}
  else if(effect.kind==='release'){const result=s.engine.measurements.results.filter(x=>x.investigation===effect.id&&x.availableAt!=null&&x.availableAt<=at).at(-1);if(result&&legacyReleaseMet(s,s.scenario.investigations.find(i=>i.id===effect.id),at)){result.releasedAt=at;result.status='released';s.investigations[effect.id] ||= {};s.investigations[effect.id].released=true;log(s,'investigation','Approved result released by authored rule',at,{instance:result.id});}}
 }
 log(s,'rule',`${r.name}: ${r.explanation}`,at,{rule:r.id});
}
function triggerMatches(trigger,s,c,at){
 if(trigger.kind==='elapsed')return at-(trigger.clock==='session'?0:s.stageAt)>=trigger.afterMs;
 if(trigger.kind==='action')return c?.type==='action'&&c.action===trigger.id&&c.answer==='yes';
 if(trigger.kind==='effective')return c?.type==='intervention'&&c.intervention===trigger.id&&c.state==='effective';
 if(trigger.kind==='faculty')return c?.type==='ruleFire'&&(!trigger.id||c.rule===trigger.id);
 if(trigger.kind==='threshold')return conditionMet({...trigger,kind:'threshold'},s,at);
 if(trigger.kind==='result')return conditionMet({...trigger,kind:'result'},s,at);
 return false;
}
function evaluateRules(s,at,c){
 if(s.mode!=='guided'&&c?.type!=='ruleFire')return;
 const candidates=(s.scenario.schedulerRules||[]).filter(r=>r.reviewed&&(r.trigger.kind!=='faculty'||c?.rule===r.id)&&triggerMatches(r.trigger,s,c,at)&&matches(r.conditions,r.match,s,at)).sort((a,b)=>(b.priority||0)-(a.priority||0)||a.id.localeCompare(b.id));
 const transitions=candidates.filter(r=>r.effects.some(e=>e.kind==='stage'||e.kind==='end'));
 if(transitions.length>1 && transitions[0].priority===transitions[1].priority)throw Error('Conflicting transitions require distinct priorities');
 let transitioned=false;
 for(const r of candidates){
  const transition=r.effects.some(e=>e.kind==='stage'||e.kind==='end');if(transition&&transitioned)continue;
  if(r.effects.some(e=>e.kind==='release'&&s.scenario.investigations.find(i=>i.id===e.id)?.requireConfirmation) && c?.confirmed!==true&&!s.confirmed)continue;
  if(r.requireConfirmation && c?.confirmed!==true && !s.confirmed)continue;
  if(r.responseKind==='recovery'&&!r.conditions?.some(x=>x.kind==='effective'&&conditionMet(x,s,at)))continue;
  const state=s.engine.scheduler.runs['rule:'+r.id]||{count:0,lastAt:null};if(state.count>=(r.repeat?.maxRuns??1)||state.lastAt!=null&&at-state.lastAt<(r.repeat?.cooldownMs??0))continue;
  state.count++;state.lastAt=at;s.engine.scheduler.runs['rule:'+r.id]=state;
  queue(s,{id:`rule:${r.id}:${state.count}`,kind:'rule',at:at+(r.onsetMs||0),rule:r.id,priority:r.priority||0,confirmed:c?.confirmed===true||s.confirmed});
  log(s,'scheduled',`${r.name}: ${r.explanation}`,at,{rule:r.id});if(transition)transitioned=true;
 }
}
function nextTimer(s,current,target){
 let next=target;
 for(const effect of s.engine.scheduler.effects.filter(e=>e.active)){const end=effect.at+effect.responseMs;if(end>current&&end<next)next=end;}
 for(const r of s.scenario.schedulerRules||[]){if(!r.reviewed||r.trigger.kind!=='elapsed')continue;const count=s.engine.scheduler.runs['rule:'+r.id]?.count||0;if(count>=(r.repeat?.maxRuns??1))continue;const due=(r.trigger.clock==='session'?0:s.stageAt)+r.trigger.afterMs;if(due>current&&due<next)next=due;const run=s.engine.scheduler.runs['rule:'+r.id];if(run?.lastAt!=null&&r.repeat?.cooldownMs){const cooldown=run.lastAt+r.repeat.cooldownMs;if(cooldown>current&&cooldown<next)next=cooldown;}}
 const thresholds=[...(s.scenario.schedulerRules||[]).flatMap(r=>[r.trigger,...(r.conditions||[]),...(r.cancelWhen||[])]),...(s.scenario.models||[]).flatMap(m=>m.cancelWhen||[])].filter(c=>c.kind==='threshold');
 for(const c of thresholds){if(!conditionMet(c,s,current)&&conditionMet(c,s,next)){let lo=current,hi=next;for(let i=0;i<40&&hi-lo>1;i++){const mid=(lo+hi)/2;if(conditionMet(c,s,mid))hi=mid;else lo=mid;}next=Math.min(next,Math.ceil(hi));}}
 return next;
}
export function advanceScheduler(s,target,c=null){
 let current=s.engine.scheduler.at;if(target<current)throw Error('Simulation time cannot move backwards');let count=0;
 while(true){if(++count>10000)throw Error('Scheduler loop guard reached; review repeat/cooldown rules');
  for(const effect of s.engine.scheduler.effects.filter(e=>e.active)){const d=s.scenario.models?.find(m=>m.id===effect.model);if(d?.cancelWhen?.length&&matches(d.cancelWhen,'any',s,current))stopEffect(s,effect,current,'cancelled by authored conditions');}
  evaluateRules(s,current,current===target?c:null);
  const due=s.engine.scheduler.queue.filter(e=>e.at<=current);s.engine.scheduler.queue=s.engine.scheduler.queue.filter(e=>e.at>current);for(const item of due){eventDue(s,item,item.at);if(s.status==='ended')break;}
  if(due.length && s.status!=='ended')continue;
  if(s.status==='ended'){s.engine.scheduler.at=current;break;}
  if(current===target){if(s.engine.scheduler.queue.some(e=>e.at<=current))continue;break;}
  const queued=s.engine.scheduler.queue[0]?.at??target;current=Math.min(target,Math.max(current,queued),nextTimer(s,current,target));
 }
 s.engine.scheduler.at=Math.min(current,target);syncPatient(s,s.engine.scheduler.at);refreshMeasurements(s,s.engine.scheduler.at);
}
export function syncPatient(s,at){const p=resolvePatient(s,at);const changed=Object.keys(p).filter(k=>s.engine.patient.lastResolved?.[k]!==undefined&&s.engine.patient.lastResolved[k]!==p[k]);if(changed.length&&s.engine.scheduler.effects.some(e=>e.active)){log(s,'physiology','Authored simulation response: '+changed.map(k=>`${k} → ${p[k]} (${s.engine.patient.owners[k]||'authored basis'})`).join('; '),at,{changes:Object.fromEntries(changed.map(k=>[k,p[k]]))});}s.engine.patient.lastResolved={...p};s.observations=Object.fromEntries(Object.keys(observationUnits).map(k=>[k,p[k]]));if(p['electrical.rhythm']!=null||Object.hasOwn(s.engine.patient.pins,'electrical.rhythm'))s.rhythm=p['electrical.rhythm'];if(p['circulation.perfusion']!=null)s.perfusion=p['circulation.perfusion'];if(p['circulation.pulse']==='absent')s.perfusion='absent';}
export function refreshMeasurements(s,at){
 const p=resolvePatient(s,at);
 for(const [id,sensor] of Object.entries(s.engine.measurements.sensors)){
  if(!sensor.attached){sensor.status='detached';continue;}if(sensor.quality==='lost'){sensor.status='lost';continue;}if(id==='nibp')continue;
  sensor.at=at;sensor.value=p[id==='ecg'?'hr':id];sensor.status='available';
 }
}
export function publicMeasurements(s){const result={};for(const id of ['ecg','spo2','rr','temp','nibp']){const m=s.engine.measurements.sensors[id];if(!m)continue;result[id]={attached:m.attached===true,quality:['clean','artefact','lost'].includes(m.quality)?m.quality:'lost',status:['available','detached','lost','acquiring','failed'].includes(m.status)?m.status:'failed',at:Number(m.at)||0,value:id==='nibp'?{sbp:Number(m.value?.sbp)||0,dbp:Number(m.value?.dbp)||0}:typeof m.value==='number'?m.value:null};}return result;}
export function domainCommand(s,c,at){
 const e=s.engine;
 switch(c.type){
 case 'mechanism':if(!mechanismSpecs[c.path])throw Error('Unsupported patient mechanism');if(!c.release)validateTarget(c.path,c.value,c.unit);if(c.release){delete e.patient.pins[c.path];}else{e.patient.pins[c.path]=c.value;}log(s,'override',c.release?`${c.path}: returned to simulation ownership`:`${c.path}: faculty override pinned`,at,{path:c.path,value:c.value});return true;
 case 'sensor':{const m=e.measurements.sensors[c.sensor];if(!m)throw Error('Unknown sensor');if(c.attached!=null&&typeof c.attached!=='boolean')throw Error('Invalid sensor attachment');if(c.quality!=null&&!['clean','artefact','lost'].includes(c.quality))throw Error('Invalid sensor quality');if(c.attached!=null)m.attached=c.attached;if(c.quality!=null)m.quality=c.quality;log(s,'sensor',`${c.sensor}: ${m.attached?'attached':'detached'}, ${m.quality}`,at);return true;}
 case 'nibp':{const m=e.measurements.sensors.nibp;if(!m.attached)throw Error('Attach the NIBP cuff first');if(m.status==='acquiring')return true;const delay=c.delayMs??s.scenario.measurementConfig?.nibpDelayMs??0;if(!Number.isFinite(delay)||delay<0||delay>600000)throw Error('Invalid cuff delay');m.status='acquiring';queue(s,{id:c.id+':cuff',kind:'cuff',at:at+delay});log(s,'measurement','NIBP cuff cycle started; previous reading held',at);return true;}
 case 'startEffect':{const m=s.scenario.models?.find(m=>m.id===c.model);if(!m)throw Error('No reviewed authored model for this treatment');const fraction=c.effectiveness??1;if(!Number.isFinite(fraction)||fraction<0||fraction>1)throw Error('Invalid effectiveness');scheduleModel(s,m,at,c,fraction);return true;}
 case 'stopEffect':{const definition=s.scenario.models?.find(m=>m.id===c.model);if(!definition)throw Error('Unknown model');for(const effect of e.scheduler.effects.filter(x=>x.model===c.model&&x.active))stopEffect(s,effect,at,'stopped by faculty');e.scheduler.queue=e.scheduler.queue.filter(x=>x.model!==c.model);return true;}
 case 'medication':{const m=c.medication;validateMedication(m);if(e.learners.medications.some(x=>x.id===c.id))return true;const spec=s.scenario.medicines?.find(x=>x.drug.toLowerCase()===m.drug.toLowerCase());if(spec&&(!spec.units.includes(m.unit)||!spec.routes.includes(m.route)))throw Error('Dose unit or route differs from the reviewed medicine definition');if(c.adminAt!=null&&(!Number.isFinite(c.adminAt)||c.adminAt<0||c.adminAt>at))throw Error('Administration time must be within elapsed simulation time');const record={...clone(m),id:c.id,at:c.adminAt??at,recordedAt:at,wallAt:c.wallAt??null,supported:!!spec,stoppedAt:null};e.learners.medications.push(record);log(s,'medication',`${m.drug}: ${m.dose} ${m.unit}, ${m.route}${m.infusion?' · infusion':''}${spec?'':' · no authored response; faculty judgement required'}`,at,{medication:c.id});return true;}
 case 'stopInfusion':{const m=e.learners.medications.find(x=>x.id===c.administration);if(!m?.infusion)throw Error('Unknown infusion');if(m.stoppedAt==null){m.stoppedAt=at;log(s,'medication',`${m.drug}: infusion stopped`,at,{medication:m.id});}return true;}
 case 'unsupported':if(typeof c.text!=='string'||!c.text.trim()||c.text.length>2000)throw Error('Describe the unsupported action');e.learners.unsupported.push({id:c.id,at,text:c.text,notes:c.notes||''});log(s,'unsupported',`${c.text} · no invented effect; faculty judgement required`,at);return true;
 case 'actionCorrection':{const a=s.scenario.stages.flatMap(x=>x.actions).find(a=>a.id===c.action);if(!a||!['yes','notyet'].includes(c.answer)||typeof c.reason!=='string'||!c.reason.trim()||c.reason.length>2000)throw Error('Correction needs an action, answer and reason');const previous=s.actions[c.action];s.actions[c.action]=c.answer;const record=e.learners.records[c.action] ||= {everCompleted:false,prompted:false,notes:[],history:[]};record.answer=c.answer;record.history.push({at,previous,answer:c.answer,reason:c.reason});log(s,'correction',`${a.text}: ${previous||'outstanding'} → ${c.answer}; ${c.reason}. Delivered treatment retained.`,at,{action:c.action});return true;}
 case 'checkpoint':if(typeof c.label!=='string'||!c.label.trim()||c.label.length>120)throw Error('Checkpoint label required');checkpoint(s,c.id,c.label, c.wallAt);return true;
 case 'connection':if(!['connected','disconnected','reconnecting'].includes(c.state)||typeof c.device!=='string'||c.device.length>128)throw Error('Invalid connection event');if(e.session.connections[c.device]!==c.state){e.session.connections[c.device]=c.state;log(s,'connection',`Controller ${c.state}`,at);}return true;
 case 'teachingLabels':if(typeof c.enabled!=='boolean')throw Error('Invalid teaching mode');e.teaching.rhythmLabels=c.enabled;log(s,'teaching',`Student rhythm labels ${c.enabled?'enabled':'hidden'}`,at);return true;
 case 'ruleFire':return true;
 case 'investigationInstance':{const item=s.scenario.investigations.find(x=>x.id===c.investigation);if(!item)throw Error('Unknown investigation');let result=e.measurements.results.find(x=>x.id===c.instance);
  if(c.state==='requested'){result={id:c.id,investigation:item.id,name:item.name,requestedAt:at,acquiredAt:null,availableAt:null,releasedAt:null,interpretedAt:null,status:'requested'};e.measurements.results.push(result);s.investigations[item.id] ||= {};s.investigations[item.id].requested=true;log(s,'investigation',`${item.name}: requested`,at,{instance:result.id});if(item.releaseOnRequest&&(item.report||item.assetPath)){acquire(s,result,at);if(result.availableAt!=null&&!item.requireConfirmation&&legacyReleaseMet(s,item,at)){result.releasedAt=at;result.status='released';s.investigations[item.id].released=true;log(s,'investigation',`${item.name}: released immediately`,at,{instance:result.id});}}return true;}
  if(!result||result.investigation!==item.id)throw Error('Select a requested investigation instance');
  if(c.state==='acquired'){if(result.acquiredAt==null)acquire(s,result,at);return true;}
  if(c.state==='released'){if(result.availableAt==null)throw Error(result.unavailableReason||'Result is not yet available');if(!legacyReleaseMet(s,item,at)||item.requireConfirmation&&c.confirmed!==true)throw Error('Faculty release conditions not confirmed');if(result.releasedAt==null){result.releasedAt=at;result.status='released';s.investigations[item.id] ||= {};s.investigations[item.id].released=true;log(s,'investigation',`${item.name}: released`,at,{instance:result.id});}return true;}
  if(c.state==='interpreted'){if(result.releasedAt==null)throw Error('Release the acquired result before interpretation');result.interpretedAt=at;result.status='interpreted';s.investigations[item.id].interpreted=true;log(s,'investigation',`${item.name}: interpreted`,at,{instance:result.id});return true;}
  throw Error('Unknown investigation lifecycle state');}
 default:return false;
 }
}
function legacyReleaseMet(s,item,at){const c=item.releaseConditions;if(!c)return true;return (!c.actions?.length||c.actions.every(id=>s.actions[id]==='yes'))&&(!c.interventions?.length||c.interventions.every(i=>s.interventions?.[i.id]?.[i.state]))&&(c.stage==null||c.stage===s.stage)&&(c.afterMs==null||at-(c.clock==='session'?0:c.clock==='branch'?(s.branchAt??s.stageAt):s.stageAt)>=c.afterMs)&&(!c.unlessEffective?.length||c.unlessEffective.every(id=>!s.interventions?.[id]?.effective))&&(!c.fromBranches?.length||c.fromBranches.includes(s.branch));}
export function validateMedication(m){
 if(!m||typeof m.drug!=='string'||!m.drug.trim()||m.drug.length>120||typeof m.route!=='string'||!['IV','IM','SC','oral','inhaled','intranasal','rectal','topical','other'].includes(m.route)||typeof m.dose!=='number'||!Number.isFinite(m.dose)||m.dose<=0||!['mg','g','µg','mcg','microgram','mL','units','IU','mmol','mEq'].includes(m.unit))throw Error('Medication requires drug, positive dose, supported dose unit and route');
 if(m.infusion&&(!Number.isFinite(m.concentration)||m.concentration<=0||!['mg/mL','µg/mL','mcg/mL','units/mL','mmol/mL'].includes(m.concentrationUnit)||!Number.isFinite(m.rate)||m.rate<=0||!['mL/h','mg/h','µg/min','mcg/min','units/h'].includes(m.rateUnit)))throw Error('Infusion requires concentration/unit and rate/unit');
}
export function syncLegacyChange(s,c,old,at){
 const e=s.engine;
 if(c.type==='rhythm')e.patient.pins['electrical.rhythm']=s.rhythm;
 if(c.type==='rhythmScenario'){delete e.patient.pins['electrical.rhythm'];e.patient.mechanisms['electrical.rhythm']=s.rhythm;}
 if(c.type==='signal')e.patient.pins['circulation.perfusion']=s.perfusion;
 if(c.type==='signalScenario')delete e.patient.pins['circulation.perfusion'];
 if(c.type==='stage'&&(s.scenario.engineVersion!==2||c.applyProfile===true)&&!s.rhythmPinned)e.patient.mechanisms['electrical.rhythm']=s.scenario.stages[s.stage].rhythm;
 if(c.type==='override')e.patient.pins[c.field]=s.observations[c.field];
 if(c.type==='unpin'){delete e.patient.pins[c.field];e.patient.base[c.field]=s.observations[c.field];}
 if(c.type==='stage'&&(s.scenario.engineVersion!==2||c.applyProfile===true))Object.assign(e.patient.base,s.scenario.stages[s.stage].observations);
 if(s.branch!==old.branch && s.branch){const b=s.scenario.branches?.find(b=>b.id===s.branch);Object.assign(e.patient.base,b?.observations||{});}
 if(c.type==='action' && c.answer==='yes'&&!old.engine.learners.records[c.action]?.everCompleted){const a=s.scenario.stages.flatMap(st=>st.actions).find(a=>a.id===c.action);if(a?.response?.reviewed&&!s.scenario.facultyPack)Object.assign(e.patient.base,a.response.observations);}
 if(canonical(s.activeRuleTargets)!==canonical(old.activeRuleTargets))Object.assign(e.patient.base,s.activeRuleTargets||{});
 if(c.type==='action'||c.type==='prompt'){
  const r=e.learners.records[c.action] ||= {answer:'notyet',everCompleted:false,prompted:false,notes:[],history:[]};
  if(c.type==='prompt'){r.prompted=true;r.history.push({at,type:'prompt'});}else{r.answer=c.answer;if(c.answer==='yes'){r.everCompleted=true;r.completedAt=at;r.independent=!r.prompted;}r.history.push({at,type:'action',answer:c.answer});}if(c.notes){if(typeof c.notes!=='string'||c.notes.length>2000)throw Error('Invalid action notes');r.notes.push({at,text:c.notes});}
 }
 if(c.type==='investigation'){
  let result=e.measurements.results.filter(r=>r.investigation===c.investigation).at(-1);
  if(c.state==='requested'){domainCommand(s,{...c,type:'investigationInstance'},at);}
  else if(c.state==='released'){if(!result){domainCommand(s,{...c,id:c.id+':requested',type:'investigationInstance',state:'requested'},at);result=e.measurements.results.at(-1);}if(result.acquiredAt==null)acquire(s,result,at);if(result.availableAt!=null){result.releasedAt=at;result.status='released';}}
  else if(c.state==='interpreted'&&result){result.interpretedAt=at;result.status='interpreted';}
 }
}
export function recordCommand(s,c,wall,accepted,reason=null){
 const e=s.engine;e.session.sequence++;e.session.lastWall=Math.max(wall,e.session.lastWall);const record={sequence:e.session.sequence,id:c.id,at:simTime(s,wall),wall,command:clone(c),accepted,reason};e.commands.push(record);if(e.commands.length>500)e.commands.shift();if(accepted)e.ids[c.id]=canonical(c);if(!accepted)log(s,'rejected',`${c.type}: rejected · ${reason}`,simTime(s,wall),{command:c.id});
}
export function validateDomains(s){
 for(const [k,v] of Object.entries(s.patientBaseline||{}))validateTarget(k,v,undefined,true);
 const ids=new Set(),setOwners=new Map();
 for(const model of s.models||[]){if(!model.id||ids.has(model.id)||model.reviewed!==true||!model.name||!model.explanation||!model.sourceNote||!['treatment','disease','adverse'].includes(model.kind))throw Error('Simulation models require unique identifiers, explicit clinical review and source qualifications');ids.add(model.id);
  if(model.priority!=null&&(!Number.isInteger(model.priority)||Math.abs(model.priority)>1000))throw Error('Invalid model priority');
  validateTargets(model.targets,model.units,model.mode);if(model.mode==='delta'&&Object.values(model.targets).some(v=>typeof v!=='number'))throw Error('Cumulative effects require numeric authored deltas');
  for(const k of ['onsetMs','responseMs','durationMs'])if(model[k]!=null&&(!Number.isFinite(model[k])||model[k]<0||model[k]>86400000))throw Error('Invalid model timing');
  if(model.durationMs!=null&&model.responseMs>model.durationMs)throw Error('Response duration exceeds effect duration');
  validateRepeat(model.repeat);for(const c of model.cancelWhen||[])validateCondition(c,s);
  if(model.intervention&&!s.interventions?.some(i=>i.id===model.intervention))throw Error('Unknown model intervention');
  if(model.kind==='treatment'&&model.intervention&&model.requireConfirmation===false)throw Error('Treatment effectiveness must be confirmed');
  if(model.wearOffTargets)validateTargets(model.wearOffTargets,model.wearOffUnits||model.units);
  for(const r of model.recurrence||[]){if(!Number.isFinite(r.delayMs)||r.delayMs<0||r.delayMs>86400000||!r.explanation)throw Error('Recurrence needs authored timing and explanation');validateTargets(r.targets,r.units||model.units);}
  if(model.mode!=='delta')for(const path of Object.keys(model.targets)){const key=path+':'+(model.priority||0);if(setOwners.has(key))throw Error(`Conflicting set models for ${path}: assign distinct priorities or an explicitly additive response`);setOwners.set(key,model.id);}
 }
 const ruleIds=new Set(),signatures=new Set();
 for(const r of s.schedulerRules||[]){if(!r.id||ruleIds.has(r.id)||r.reviewed!==true||!r.name||!r.explanation||!r.sourceNote||!['all','any'].includes(r.match))throw Error('Rules require unique identifiers, review, source note and explanation');ruleIds.add(r.id);if(!r.effects?.length)throw Error('Rule needs an effect');
  if(!['elapsed','action','effective','threshold','result','faculty'].includes(r.trigger?.kind))throw Error('Unsupported trigger');
  if(r.trigger.kind==='elapsed'){if(!Number.isFinite(r.trigger.afterMs)||r.trigger.afterMs<0||r.trigger.afterMs>86400000)throw Error('Invalid rule trigger timer');}else if(r.trigger.kind!=='faculty')validateCondition({...r.trigger,kind:r.trigger.kind},s);
  for(const c of [...(r.conditions||[]),...(r.cancelWhen||[])])validateCondition(c,s);validateRepeat(r.repeat);
  for(const k of ['onsetMs','responseMs'])if(r[k]!=null&&(!Number.isFinite(r[k])||r[k]<0||r[k]>86400000))throw Error('Invalid rule delay/duration');
  if(r.priority!=null&&(!Number.isInteger(r.priority)||Math.abs(r.priority)>1000))throw Error('Invalid rule priority');
  const signature=canonical([r.trigger,r.conditions,r.match,r.priority||0]);if(signatures.has(signature))throw Error('Conflicting rule triggers require distinct priorities');signatures.add(signature);
  if(r.responseKind==='recovery'&&!r.conditions?.some(c=>c.kind==='effective'))throw Error('Recovery requires a confirmed effective intervention condition');
  for(const effect of r.effects){if(effect.kind==='targets')validateTargets(effect.targets,effect.units,effect.mode);else if(['startModel','stopModel'].includes(effect.kind)&&!ids.has(effect.id))throw Error('Unsupported treatment model');else if(effect.kind==='stage'&&!s.stages.some(st=>st.id===effect.id))throw Error('Missing rule stage destination');else if(effect.kind==='enableBranch'&&!s.branches?.some(b=>b.id===effect.id))throw Error('Missing branch destination');else if(effect.kind==='release'&&!s.investigations.some(i=>i.id===effect.id))throw Error('Missing investigation destination');else if(effect.kind==='cue'&&(typeof effect.text!=='string'||effect.text.length>20000))throw Error('Invalid rule cue');else if(effect.kind==='end'&&(typeof effect.outcome!=='string'||!effect.outcome.trim()))throw Error('Defined outcome required');else if(!['targets','startModel','stopModel','stage','enableBranch','release','cue','end'].includes(effect.kind))throw Error('Unsupported rule effect');}
 }
 if(s.measurementConfig?.nibpDelayMs!=null&&(!Number.isFinite(s.measurementConfig.nibpDelayMs)||s.measurementConfig.nibpDelayMs<0||s.measurementConfig.nibpDelayMs>86400000))throw Error('Invalid cuff acquisition delay');
 for(const m of s.medicines||[])if(!m.drug?.trim()||!m.units?.length||!m.routes?.length||m.units.some(u=>!['mg','g','µg','mcg','microgram','mL','units','IU','mmol','mEq'].includes(u))||m.routes.some(r=>!['IV','IM','SC','oral','inhaled','intranasal','rectal','topical','other'].includes(r)))throw Error('Medicine definitions need supported explicit units and routes');
 for(const i of s.investigations){if(i.availabilityDelayMs!=null&&(!Number.isFinite(i.availabilityDelayMs)||i.availabilityDelayMs<0||i.availabilityDelayMs>86400000))throw Error('Invalid result availability delay');for(const v of i.reportVariants||[]){if(v.reviewed!==true||typeof v.report!=='string'||v.report.length>50000)throw Error('Report variants require approved supplied text');for(const c of v.conditions||[])validateCondition(c,s);}}
 if(s.engineVersion!=null&&![1,2].includes(s.engineVersion))throw Error('Unsupported scenario engine version');
 if(s.variation?.enabled&&(!Number.isInteger(s.variation.seed)||!Number.isFinite(s.variation.seed)))throw Error('Variation requires a recorded integer random seed');
 for(const r of s.variation?.ranges||[]){if(r.reviewed!==true||!Number.isFinite(r.min)||!Number.isFinite(r.max)||r.min>r.max)throw Error('Variation needs reviewed finite ranges');validateTarget(r.path,r.min,r.unit);validateTarget(r.path,r.max,r.unit);if((observationUnits[r.path]||mechanismSpecs[r.path]?.unit)!==r.unit)throw Error('Variation unit required');}
 return s;
}
function validateRepeat(r){if(r&&(!Number.isInteger(r.maxRuns)||r.maxRuns<1||r.maxRuns>100||r.maxRuns>1&&(!Number.isFinite(r.cooldownMs)||r.cooldownMs<1000)))throw Error('Repeating rules require a finite run limit and cooldown of at least one second');}
function validateTargets(targets,units,mode){if(!targets||typeof targets!=='object'||!Object.keys(targets).length)throw Error('Model needs explicitly authored targets');for(const [k,v] of Object.entries(targets)){if(mode==='delta'){const limits=obsLimits[k]||[mechanismSpecs[k]?.min,mechanismSpecs[k]?.max];if(typeof v!=='number'||!Number.isFinite(v)||!Number.isFinite(limits[1])||Math.abs(v)>limits[1]-limits[0])throw Error('Invalid explicitly additive target');}else validateTarget(k,v,units?.[k]);const unit=observationUnits[k]||mechanismSpecs[k]?.unit;if(unit&&units?.[k]!==unit)throw Error(`Missing or invalid ${unit} unit for ${k}`);}}
function validateCondition(c,s){if(c.kind==='stage'){if(!s.stages.some(st=>st.id===c.id))throw Error('Missing condition stage');return;}if(c.kind==='not'){validateCondition(c.condition,s);return;}if(c.kind==='threshold'){validateTarget(c.path,c.value);if(!['lt','lte','gt','gte','eq','neq'].includes(c.operator))throw Error('Invalid threshold comparison');return;}if(c.kind==='time'){if(!Number.isFinite(c.afterMs)||c.afterMs<0)throw Error('Invalid condition timer');return;}if(c.kind==='confirmation')return;if(c.kind==='action'&&!s.stages.flatMap(st=>st.actions).some(a=>a.id===c.id)||['effective','intervention'].includes(c.kind)&&!s.interventions?.some(i=>i.id===c.id)||c.kind==='result'&&!s.investigations.some(i=>i.id===c.id))throw Error('Missing condition target');if(c.kind==='intervention'&&!lifecycle.includes(c.state))throw Error('Invalid intervention lifecycle');if(!['action','effective','intervention','result'].includes(c.kind))throw Error('Unsupported rule condition');}
