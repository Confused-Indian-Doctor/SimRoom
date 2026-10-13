export const PULSE_DELAY:number;
export function ecgSample(age:number,period?:number):number;
export function plethSample(age:number,period?:number):number;
export class SignalClock {time:number;lastPulse:number;phase:number;rate:number;beats:{at:number;period:number}[];advance(dt:number,target:number,rhythm?:string|null,perfusion?:string):boolean;sample(time:number,rhythm:string|null,perfusion?:string,quality?:string):{ecg:number;pleth:number}}
