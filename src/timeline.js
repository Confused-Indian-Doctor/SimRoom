/** Sort scheduled simulation events within each run; reset begins a new clock epoch. */
export function timeline(events){const result=[],pending=[];const flush=()=>{result.push(...pending.sort((a,b)=>a.at-b.at));pending.length=0;};for(const e of events){if(e.type==='reset'){flush();result.push(e);}else pending.push(e);}flush();return result;}
