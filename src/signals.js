/** Educational single-lead signals, not diagnostic ECGs. Time is seconds. */
export const PULSE_DELAY = 0.2;
const gauss=(x,c,w,a)=>a*Math.exp(-0.5*((x-c)/w)**2);
export function ecgSample(age,period=1){
 const t=age,pr=period<.5?.13:.15,tw=Math.max(.025,Math.min(.065,.055*Math.sqrt(period)));
 // QRS R peak is time zero. PR is 120–180 ms and QRS stays narrow.
 return gauss(t,-pr,.022,.13)+gauss(t,-.02,.008,-.17)+gauss(t,0,.009,1)+gauss(t,.025,.012,-.25)+gauss(t,Math.min(.34,.24*Math.sqrt(period)),tw,.28);
}
export function plethSample(age,period=1){
 const t=age-PULSE_DELAY;if(t<0 || t>Math.min(period,.9))return 0;
 const rise=1-Math.exp(-t/.025),decay=Math.exp(-t/.24);
 return .95*rise*decay-gauss(t,.22,.018,.07)+gauss(t,.27,.025,.04);
}
export class SignalClock {
 constructor(){this.time=0;this.phase=0;this.rate=60;this.beats=[];this.initialized=false;this.lastPulse=-Infinity;}
 advance(dt,target,rhythm='sinus',perfusion='normal'){
  if(!Number.isFinite(dt)||dt<=0)return false;
  target=Math.max(0,Math.min(300,target));
  if(target===0){this.time+=dt;this.rate=0;this.initialized=true;this.beats=this.beats.filter(b=>this.time-b.at<10);return false;}
  if(!this.initialized){this.rate=target;this.initialized=true;this.beats.push({at:this.time,period:target?60/target:1});}
  // No audio/animation catch-up when a tab returns from the background.
  if(dt>1){this.time+=dt;this.phase=(this.phase+dt*this.rate/60)%1;this.beats=[];return false;}
  const old=this.rate;this.rate=target+(old-target)*Math.exp(-dt/0.35);
  const frequency=(old+this.rate)/120;
  const before=this.phase;this.phase+=dt*frequency;
  if(this.phase>=1 && frequency>0){const at=this.time+(1-before)/frequency;this.phase%=1;this.beats.push({at,period:60/Math.max(this.rate,1)});}
  this.time+=dt;this.beats=this.beats.filter(b=>this.time-b.at<10);
  const pulse=this.beats.findLast(b=>this.time>=b.at+PULSE_DELAY && b.at>this.lastPulse);
  if(pulse){this.lastPulse=pulse.at;return rhythm!=='vf'&&rhythm!=='asystole'&&perfusion!=='absent';}return false;
 }
 sample(time,rhythm,perfusion='normal',quality='clean'){
  let ecg=0,pleth=0;
  if(rhythm==='vf')ecg=.24*Math.sin(time*37)+.12*Math.sin(time*61)+.07*Math.sin(time*19);
  else if(rhythm==='sinus'){
   for(const b of this.beats){const age=time-b.at;if(age>-.25 && age<1.3)ecg+=ecgSample(age,b.period);}
   // Predict the upcoming QRS to draw its preceding P wave without sending samples.
   if(this.rate>0){const next=this.time+(1-this.phase)*60/this.rate;const age=time-next;if(age>-.25 && age<0)ecg+=ecgSample(age,60/this.rate);}
  }
  if(rhythm!=='vf' && rhythm!=='asystole' && perfusion!=='absent')for(const b of this.beats){const age=time-b.at;if(age>=0 && age<1.3)pleth+=plethSample(age,b.period)*(perfusion==='poor'?.2:1);}
  if(quality==='artefact'){const noise=.045*Math.sin(time*93)+.04*Math.sin(time*137);ecg+=noise;pleth+=noise*.7;}
  return {ecg,pleth};
 }
}
