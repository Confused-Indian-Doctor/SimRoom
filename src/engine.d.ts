import type {Scenario,Session,MonitorState} from './types';
export function createSession(s:Scenario,owner:string,now:number):Session;
export function applyCommand(s:Session,c:Record<string,unknown>,now:number):Session;
export function validateScenario(s:Scenario):Scenario;
export function monitorState(s:Session,now:number):MonitorState;

export function values(s:Session,now:number):import("./types").Obs;

export function processCommand(s:Session,c:Record<string,unknown>,now:number):{state:Session;accepted:boolean;duplicate?:boolean;error?:string};
export function replaySession(s:Session,commands?:import('./types').CommandRecord[]):Session;
export function forkFromCheckpoint(s:Session,id:string,now?:number):Session;
