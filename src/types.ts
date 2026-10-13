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
  "requested" | "prescribed" | "administered" | "performed" | "effective";
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
  }[];
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
  released: { id: string; name: string }[];
};
export type Session = MonitorState & {
  owner: string;
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
