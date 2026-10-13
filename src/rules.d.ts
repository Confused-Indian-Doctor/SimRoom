import type {Scenario,Session,Rule} from './types';
export const units:Record<string,string>;
export const limits:Record<string,[number,number]>;
export function ruleMatches(rule:Rule,s:Session,time:number):boolean;
export function ruleSummary(rule:Rule,s:Scenario):string;
export function graphWarnings(s:Scenario):string[];
export function validateRules(s:Scenario):Scenario;
