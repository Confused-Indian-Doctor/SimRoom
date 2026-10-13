/** Preserve indexed legacy condition targets when outline stages are reordered. */
export function reorderStage(d,index,next){
 if(next<0||next>=d.stages.length)return;
 const ids=d.stages.map(s=>s.id);[d.stages[index],d.stages[next]]=[d.stages[next],d.stages[index]];
 for(const x of [...(d.branches||[]).map(b=>b.conditions),...d.investigations.map(i=>i.releaseConditions)])if(x?.stage!=null)x.stage=d.stages.findIndex(s=>s.id===ids[x.stage]);
}
export function affectedConnections(d,index){
 const st=d.stages[index],actions=new Set(st.actions.map(a=>a.id));const affected=[];
 for(const s of d.stages){for(const r of s.rules||[])if(s.id===st.id||r.then.stage===st.id||r.otherwise===st.id||r.when.some(c=>c.kind==='action'&&actions.has(c.id)))affected.push(`${s.name}: rule ${r.id}`);if(s.transition && (d.stages[d.stages.indexOf(s)+1]?.id===st.id||s.transition.actions?.some(a=>actions.has(a))))affected.push(`${s.name}: legacy next-stage transition`);}
 for(const b of d.branches||[])if(b.conditions?.stage===index||b.conditions?.actions?.some(a=>actions.has(a)))affected.push(`Branch: ${b.name}`);
 for(const i of d.investigations)if(i.releaseConditions?.stage===index||i.releaseConditions?.actions?.some(a=>actions.has(a)))affected.push(`Investigation: ${i.name}`);return affected;
}
export function deleteStage(d,index){
 if(d.stages.length<2)throw Error('Keep at least one stage');
 const removed=d.stages[index],ids=d.stages.map(s=>s.id),actions=new Set(removed.actions.map(a=>a.id));
 // Dependent clinical branches/results cannot silently become unconditional.
 if((d.branches||[]).some(b=>b.conditions?.stage===index||b.conditions?.actions?.some(a=>actions.has(a)))||d.investigations.some(i=>i.releaseConditions?.stage===index||i.releaseConditions?.actions?.some(a=>actions.has(a))))throw Error('This stage has branch or investigation conditions. Update those conditions before deleting it.');
 const previous=d.stages[index-1];if(previous?.transition)previous.transition=null;
 d.stages.splice(index,1);
 for(const s of d.stages){s.rules=(s.rules||[]).filter(r=>r.then.stage!==removed.id&&r.otherwise!==removed.id&&!r.when.some(c=>c.kind==='action'&&actions.has(c.id)));if(s.transition?.actions?.some(a=>actions.has(a)))s.transition=null;}
 for(const x of [...(d.branches||[]).map(b=>b.conditions),...d.investigations.map(i=>i.releaseConditions)])if(x?.stage!=null)x.stage=d.stages.findIndex(s=>s.id===ids[x.stage]);
}
export function duplicateStage(d,index,id){
 const copy=structuredClone(d.stages[index]);copy.id=id();copy.name+=' (copy)';const remap=new Map();copy.actions=copy.actions.map(a=>{const key=id();remap.set(a.id,key);return {...a,id:key}});
 if(copy.transition?.actions)copy.transition.actions=copy.transition.actions.map(a=>remap.get(a)||a);
 copy.rules=(copy.rules||[]).map(r=>({...r,id:id(),when:r.when.map(c=>c.kind==='action'?{...c,id:remap.get(c.id)||c.id}:c)}));
 const ids=d.stages.map(s=>s.id);d.stages.splice(index+1,0,copy);
 for(const x of [...(d.branches||[]).map(b=>b.conditions),...d.investigations.map(i=>i.releaseConditions)])if(x?.stage!=null)x.stage=d.stages.findIndex(s=>s.id===ids[x.stage]);return copy;
}
