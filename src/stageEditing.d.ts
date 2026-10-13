import type {Scenario} from './types';
export function reorderStage(s:Scenario,index:number,next:number):void;
export function affectedConnections(s:Scenario,index:number):string[];
export function deleteStage(s:Scenario,index:number):void;
export function duplicateStage(s:Scenario,index:number,id:()=>string):Scenario['stages'][number];
