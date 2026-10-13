import type {Scenario,Session,MonitorState} from './types';
export function createSession(s:Scenario,owner:string,now:number):Session;
export function applyCommand(s:Session,c:Record<string,unknown>,now:number):Session;
export function validateScenario(s:Scenario):Scenario;
export function monitorState(s:Session,now:number):MonitorState;

export function values(s:Session,now:number):import("./types").Obs;
