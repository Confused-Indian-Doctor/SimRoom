export type Rule={id:string;reviewed:boolean;match:"all"|"any";when:({kind:"action"|"effective";id:string}|{kind:"time";afterMs:number}|{kind:"confirmation"})[];then:{stage?:string;observations?:Partial<Obs>;release?:string;cue?:string};durationMs?:number;otherwise?:string;sourceNote:string};
export type Obs = {
  hr: number;
  spo2: number;
  sbp: number;
  dbp: number;
  rr: number;
  temp: number;
};
export type Action = {
  id: string;
  text: string;
  objective: string;
  response: null | { reviewed: boolean; observations: Partial<Obs> };
};
export type InterventionState =
  "considered" | "requested" | "prescribed" | "prepared" | "administered" | "performed" | "effective" | "reassessed";
export type Conditions = {
  actions?: string[];
  interventions?: { id: string; state: InterventionState }[];
  unlessEffective?: string[];
  fromBranches?: string[];
  stage?: number;
  afterMs?: number;
  clock?: "session" | "stage" | "branch";
};
export type Branch = {
  id: string;
  name: string;
  kind: "deterioration" | "treatment" | "recovery";
  provenance: "original" | "faculty-authored";
  sourceNote: string;
  reviewed: boolean;
  conditions?: Conditions;
  requireConfirmation?: boolean;
  automatic?: boolean;
  observations?: Partial<Obs>;
  durationMs?: number;
  findings?: string;
  cues?: string;
};
export type FacultyPack = Partial<
  Record<
    | "openingHandover"
    | "historyAnswers"
    | "actorInstructions"
    | "nurseInstructions"
    | "equipment"
    | "debriefQuestions"
    | "teachingPoints"
    | "exampleSBAR"
    | "references"
    | "revisionNotes"
    | "pilotChecklist"
    | "originalText",
    string
  >
>;
export type Scenario = {
  id: string;
  version: number;
  title: string;
  patient: string;
  briefing: string;
  history: string;
  preparation: string;
  source: string;
  review: string[];
  objectives: { id: string; text: string }[];
  investigations: {
    id: string;
    name: string;
    assetPath: string | null;
    report?: string;
    releaseOnRequest?: boolean;
    releaseConditions?: Conditions;
    requireConfirmation?: boolean;
    facultyNote?: string;
    availabilityDelayMs?:number;
    reportVariants?: {report:string;reviewed:boolean;conditions:EngineCondition[];match:'all'|'any'}[];
  }[];
  engineVersion?: 1|2;
  patientBaseline?: Record<string,PatientValue>;
  models?: AuthoredModel[];
  schedulerRules?: ScheduledRule[];
  medicines?: {drug:string;units:string[];routes:string[];guidance?:string}[];
  measurementConfig?: {nibpDelayMs?:number};
  variation?: {enabled:boolean;seed:number;ranges?:{path:string;min:number;max:number;unit:string;reviewed:boolean}[]};
  facultyPack?: FacultyPack;
  interventions?: {
    id: string;
    name: string;
    guidance?: string;
    objective?: string;
  }[];
  branches?: Branch[];
  timeJumps?: {
    id: string;
    label: string;
    advanceMs: number;
    reviewed: boolean;
  }[];
  stages: {
    id: string;
    name: string;
    rules?: Rule[];
    observations: Obs;
    originalObservations?: Obs;
    observationsProvenance?: "original" | "faculty-authored";
    oxygen: string;
    oxygenSetting?: { device: string; flow: number | null };
    rhythm: string | null;
    perfusion?: "normal" | "poor" | "absent";
    signalQuality?: "clean" | "artefact";
    description?: string;
    consciousness?: string;
    debrief?: string;
    findings: string;
    cues: string;
    sourceTrigger: string;
    teachingWindow?: string;
    transition: null | {
      reviewed: boolean;
      combination: "all" | "any";
      actions?: string[];
      afterMs?: number;
      requireConfirmation?: boolean;
      durationMs?: number;
    };
    actions: Action[];
  }[];
};
export type Event = {
  id: string;
  at: number;
  type: string;
  label: string;
  stage: number;
  action?: string;
  answer?: string;
  observations?: Obs;
  branch?: string;
  intervention?: string;
  interventionState?: InterventionState;
  oxygen?: string;
  ventilation?: { assisted: boolean; rate: number | null };
};
export type MonitorState = {
  patient: string;
  status: string;
  elapsed: number;
  anchor: number;
  observations: Obs;
  pins: Partial<Record<keyof Obs, boolean>>;
  ramp: null | { from: Obs; to: Obs; at: number; duration: number };
  oxygen: string;
  oxygenDevice?: string;
  oxygenFlow?: number | null;
  ventilation?: { assisted: boolean; rate: number | null };
  rhythm: string | null;
  perfusion?: "normal" | "poor" | "absent";
  signalQuality?: "clean" | "artefact";
  revision: number;
  updatedAt: number;
  alarmAck: boolean;
  measurements?:Record<string,Measurement>;
  rhythmLabels?:boolean;
  signalRate?:number;
  released: { id: string; name: string;instance?:string;acquiredAt?:number;releasedAt?:number }[];
};
export type Session = MonitorState & {
  owner: string;
  engine?:EngineState;
  scenario: Scenario;
  stage: number;
  code: string;
  mode: string;
  actions: Record<string, string>;
  investigations: Record<string, Record<string, boolean>>;
  events: Event[];
  oxygenPinned: boolean;
  interventions?: Record<string, Partial<Record<InterventionState, boolean>>>;
  branch?: string | null;
  timeJumps?: string[];
};

export type PatientValue = string | number | null;
export type EngineCondition = {kind:'stage'|'action'|'effective'|'intervention'|'time'|'confirmation'|'result'|'threshold'|'not';id?:string;state?:InterventionState;afterMs?:number;clock?:'session'|'stage'|'branch';path?:string;operator?:'lt'|'lte'|'gt'|'gte'|'eq'|'neq';value?:PatientValue;condition?:EngineCondition};
export type AuthoredModel={id:string;name:string;kind:'treatment'|'disease'|'adverse';reviewed:boolean;sourceNote:string;explanation:string;intervention?:string;requireConfirmation?:boolean;mode?:'set'|'delta';priority:number;targets:Record<string,PatientValue>;units:Record<string,string>;onsetMs?:number;responseMs?:number;durationMs?:number;wearOffTargets?:Record<string,PatientValue>;wearOffUnits?:Record<string,string>;recurrence?:{delayMs:number;targets:Record<string,PatientValue>;units:Record<string,string>;explanation:string}[];cancelWhen?:EngineCondition[];repeat?:{maxRuns:number;cooldownMs:number}};
export type ScheduledRule={id:string;name:string;reviewed:boolean;explanation:string;sourceNote:string;trigger:{kind:'elapsed'|'action'|'effective'|'faculty'|'threshold'|'result';id?:string;clock?:'session'|'stage';afterMs?:number;path?:string;operator?:EngineCondition['operator'];value?:PatientValue};match:'all'|'any';conditions:EngineCondition[];effects:{kind:'targets'|'startModel'|'stopModel'|'release'|'cue'|'enableBranch'|'stage'|'end';id?:string;targets?:Record<string,PatientValue>;units?:Record<string,string>;mode?:'set'|'delta';text?:string;outcome?:string}[];priority:number;onsetMs?:number;responseMs?:number;requireConfirmation?:boolean;responseKind?:'authored'|'recovery';repeat?:{maxRuns:number;cooldownMs:number};cancelWhen?:EngineCondition[]};
export type Measurement={attached:boolean;quality:'clean'|'artefact'|'lost';status:string;at:number;value:number|null|{sbp:number;dbp:number}};
export type MedicationRecord={id:string;drug:string;dose:number;unit:string;route:string;at:number;recordedAt?:number;wallAt?:number;infusion?:boolean;concentration?:number;concentrationUnit?:string;rate?:number;rateUnit?:string;supported:boolean;stoppedAt:number|null};
export type InvestigationResult={id:string;investigation:string;name:string;requestedAt:number;acquiredAt:number|null;availableAt:number|null;releasedAt:number|null;interpretedAt:number|null;status:string;report?:string|null;assetPath?:string|null;unavailableReason?:string;snapshot?:{observations:Obs;mechanisms:Record<string,PatientValue>;oxygen:{device:string;flow:number|null;description:string};ventilation:{assisted:boolean;rate:number|null}}};
export type CommandRecord={id:string;sequence:number;at:number;wall:number;command:Record<string,unknown>;accepted:boolean;reason:string|null};
export type EngineState={version:2;patient:{base:Obs;mechanisms:Record<string,PatientValue>;pins:Record<string,PatientValue>;owners:Record<string,string>};measurements:{sensors:Record<string,Measurement>;results:InvestigationResult[]};learners:{records:Record<string,{answer:string;everCompleted:boolean;prompted:boolean;independent?:boolean;completedAt?:number;notes:{at:number;text:string}[];history:Record<string,unknown>[]} >;medications:MedicationRecord[];unsupported:{id:string;at:number;text:string;notes:string}[]};teaching:{stage?:number;objectives?:string[];enabledBranches:string[];outcome:string|null;rhythmLabels?:boolean};scheduler:{at:number;queue:{id:string;kind:string;at:number;model?:string;rule?:string;instance?:string}[];effects:{id:string;model:string;name:string;active:boolean;at:number;responseMs:number;priority:number;kind:string;targets:Record<string,PatientValue>;mode:string;effectiveness:number}[];runs:Record<string,{count:number;lastAt:number|null}>};session:{seed:number;randomState:number;sequence:number;lastWall:number;connections:Record<string,string>};commands:CommandRecord[];checkpoints:{id:string;label:string;at:number;sequence:number;eventCount:number;state:unknown}[];origin:unknown;baselineEventCount:number};
