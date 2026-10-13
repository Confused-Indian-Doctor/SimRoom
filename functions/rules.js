export const units={hr:'bpm',spo2:'%',rr:'/min',sbp:'mmHg',dbp:'mmHg',temp:'°C'};
export const limits={hr:[0,300],spo2:[0,100],rr:[0,100],sbp:[0,300],dbp:[0,200],temp:[0,45]};
export function ruleMatches(rule,s,time){
 const checks=rule.when.map(c=>c.kind==='action'?s.actions[c.id]==='yes':c.kind==='effective'?s.interventions?.[c.id]?.effective===true:c.kind==='time'?time-s.stageAt>=c.afterMs:c.kind==='confirmation'?s.confirmed===true:false);
 return checks.length>0 && (rule.match==='any'?checks.some(Boolean):checks.every(Boolean));
}
export function ruleSummary(rule,scenario){
 const actions=scenario.stages.flatMap(s=>s.actions),interventions=scenario.interventions||[];
 const when=rule.when.map(c=>c.kind==='action'?`${actions.find(a=>a.id===c.id)?.text||c.id} completed`:c.kind==='effective'?`${interventions.find(i=>i.id===c.id)?.name||c.id} confirmed effective`:c.kind==='time'?`${c.afterMs/1000} seconds elapsed in stage`:'faculty confirmation');
 const effects=[];if(rule.then.stage)effects.push(`move to ${scenario.stages.find(s=>s.id===rule.then.stage)?.name||rule.then.stage}`);
 for(const [k,v] of Object.entries(rule.then.observations||{}))effects.push(`${k.toUpperCase()} → ${v} ${units[k]}`);
 if(rule.then.release)effects.push(`release ${scenario.investigations.find(i=>i.id===rule.then.release)?.name||rule.then.release}`);
 if(rule.then.cue)effects.push(`show cue: ${rule.then.cue}`);
 return `WHEN ${when.join(rule.match==='any'?' OR ':' AND ')} THEN ${effects.join('; ')}${rule.durationMs?` gradually over ${rule.durationMs/1000} seconds`:' immediately'}. OTHERWISE ${rule.otherwise?`move to ${scenario.stages.find(s=>s.id===rule.otherwise)?.name||rule.otherwise}`:'remain in stage'}.`;
}
export function graphWarnings(s){
 const edges=new Map(s.stages.map((st,i)=>[st.id,[...(st.transition&&i<s.stages.length-1?[s.stages[i+1].id]:[]),...(st.rules||[]).flatMap(r=>[r.then.stage,r.otherwise].filter(Boolean))]]));
 const reachable=new Set();function visit(id){if(reachable.has(id))return;reachable.add(id);for(const to of edges.get(id)||[])visit(to)}visit(s.stages[0]?.id);
 const warnings=s.stages.filter(st=>!reachable.has(st.id)).map(st=>`${st.name}: unreachable in guided mode; manual selection remains available.`);
 const cycles=new Set(),colors=new Map();function cycle(id){if(colors.get(id)===1){cycles.add(id);return}if(colors.get(id)===2)return;colors.set(id,1);for(const to of edges.get(id)||[])cycle(to);colors.set(id,2)}for(const st of s.stages)cycle(st.id);
 if(cycles.size)warnings.push('Cycle detected. Rules are applied once per session to prevent repeated treatment responses.');return warnings;
}
export function validateRules(s){
 const stages=new Set(s.stages.map(st=>st.id)),actions=new Set(s.stages.flatMap(st=>st.actions.map(a=>a.id))),interventions=new Set((s.interventions||[]).map(i=>i.id)),investigations=new Set(s.investigations.map(i=>i.id));
 if(stages.size!==s.stages.length || stages.has(''))throw Error('Stage identifiers must be unique');
 const ruleIds=new Set();
 for(const st of s.stages){
  for(const [k,v] of Object.entries(st.observations)){if(!limits[k] || v<limits[k][0] || v>limits[k][1])throw Error(`${st.name}: impossible ${k} value`)}
  if(st.observations.dbp>st.observations.sbp)throw Error(`${st.name}: diastolic BP exceeds systolic BP`);
  const signatures=new Set();
  for(const r of st.rules||[]){
   if(!r.id || ruleIds.has(r.id))throw Error('Duplicate rule identifier');ruleIds.add(r.id);
   if(r.reviewed!==true || !['all','any'].includes(r.match) || !r.when?.length)throw Error('Rules require review and at least one condition');
   const sig=JSON.stringify({match:r.match,when:r.when});if(signatures.has(sig))throw Error('Conflicting rules have identical conditions');signatures.add(sig);
   for(const c of r.when){if(!['action','effective','time','confirmation'].includes(c.kind))throw Error('Unknown WHEN condition');if(c.kind==='action'&&!actions.has(c.id)||c.kind==='effective'&&!interventions.has(c.id))throw Error('Missing condition action/intervention');if(c.kind==='time'&&(!Number.isFinite(c.afterMs)||c.afterMs<0||c.afterMs>86400000))throw Error('Invalid timer');}
   if(!r.then || !Object.keys(r.then).some(k=>r.then[k]!=null && (typeof r.then[k]!=='object'||Object.keys(r.then[k]).length)))throw Error('Rule needs a THEN effect');
   if(r.then.stage&&!stages.has(r.then.stage)||r.otherwise&&!stages.has(r.otherwise))throw Error('Missing branch destination');
   if(r.otherwise && !r.when.some(c=>c.kind==='time'))throw Error('An alternative needs an explicit timer decision point');
   if(r.then.release&&!investigations.has(r.then.release))throw Error('Missing release result');
   if(r.then.release){const i=s.investigations.find(i=>i.id===r.then.release);if(!i.assetPath&&!i.report)throw Error('Cannot release an investigation without an approved asset or supplied report');}
   if(r.durationMs!=null&&(!Number.isFinite(r.durationMs)||r.durationMs<0||r.durationMs>3600000))throw Error('Invalid response duration');
   for(const [k,v] of Object.entries(r.then.observations||{})){if(!limits[k]||!Number.isFinite(v)||v<limits[k][0]||v>limits[k][1])throw Error('Impossible response observation');}
   // Recording or requesting alone never supplies a treatment response in pack content.
   if(s.facultyPack && (r.then.observations||r.then.stage) && !r.when.some(c=>c.kind==='effective'||c.kind==='confirmation'||c.kind==='time'))throw Error('Pack treatment response needs effectiveness or faculty confirmation');
   if(typeof r.sourceNote!=='string'||!r.sourceNote.trim())throw Error('Record the authored response source qualification');
  }
 }
 return s;
}
