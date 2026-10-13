import {useEffect,useRef} from 'react';
import {SignalClock} from './signals.js';
export function SignalCanvas({clock,rate,rhythm,perfusion,quality,active,reference,pleth=false,onPulse}:{clock:SignalClock;rate:number;rhythm:string|null;perfusion:string;quality:string;active:boolean;reference:{time:number;local:number};pleth?:boolean;onPulse?:()=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),settings=useRef({rate,rhythm,perfusion,quality,active,reference,onPulse});
 settings.current={rate,rhythm,perfusion,quality,active,reference,onPulse};
 useEffect(()=>{let frame=0,last=performance.now(),previous=clock.time;const history:{time:number;value:number}[]=[];let sampleAt=clock.time;
  const draw=(now:number)=>{const c=canvas.current;if(!c)return;const v=settings.current,dt=(now-last)/1000;last=now;
   if(!pleth && v.active && document.visibilityState==='visible'){const target=v.reference.time+(now-v.reference.local)/1000;if(Math.abs(target-clock.time)>1){clock.time=target;clock.phase=(target*v.rate/60)%1;clock.beats=[];clock.lastPulse=target;}else if(clock.advance(dt,v.rate,v.rhythm,v.perfusion))v.onPulse?.()}
   const t=clock.time;if(t-previous>1){history.length=0;sampleAt=t}previous=t;
   while(sampleAt<t){sampleAt+=1/200;const signal=clock.sample(sampleAt,v.rhythm,v.perfusion,v.quality);history.push({time:sampleAt,value:pleth?signal.pleth:signal.ecg})}
   const w=c.clientWidth,h=c.clientHeight,dpr=window.devicePixelRatio||1;
   if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr)}
   const ctx=c.getContext('2d');if(ctx){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.strokeStyle=pleth?'#43dcf5':'#6de79b';ctx.lineWidth=1.7;ctx.beginPath();
    const seconds=Math.max(4,w/100),sweep=t%seconds,gap=.12;
    while(history.length && history[0].time<t-seconds)history.shift();let pen=false;
    for(const p of history){const x=(p.time%seconds)/seconds*w;if((p.time%seconds)>sweep && (p.time%seconds)<sweep+gap){pen=false;continue}const y=h*.65-p.value*h*.5;if(!pen||x<1){ctx.moveTo(x,y);pen=true}else ctx.lineTo(x,y)}ctx.stroke();}
   frame=requestAnimationFrame(draw);
  };frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
 },[clock,pleth]);
 return <canvas ref={canvas} aria-label={pleth?'Simulated perfusing pulse waveform':'Simulated single-lead bedside ECG waveform'}/>;
}
