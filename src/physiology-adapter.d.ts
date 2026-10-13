import type {Scenario,Session,Obs} from './types';
/** Proposed integration contract. Pulse itself is not installed or integrated. */
export interface PhysiologyAdapter {
 readonly id:string;
 readonly owns:string[];
 initialise(input:{scenario:Scenario;seed:number}):unknown;
 supports(action:{type:string}):boolean;
 apply(command:Record<string,unknown>,wall:number):unknown;
 advance(wall:number,id:string):unknown;
 read(wall:number):{model:string;observations:Obs;mechanisms:Record<string,unknown>;owners:Record<string,string>;seed:number};
 fork(checkpoint:string,wall?:number):PhysiologyAdapter;
 serialise():unknown;
 restore(checkpoint:unknown):unknown;
}
