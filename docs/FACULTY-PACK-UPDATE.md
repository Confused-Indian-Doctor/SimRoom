# Faculty pack update status

The current CIDSIMROOM application is continued, not replaced. The GitHub repository previously contained only its initial README; the existing working source is now being published with this update.

## Missing source material

The four new complete faculty packs were not attached to the request or present in the execution workspace. Only the earlier six STEMI, PE and PTX checklist/history DOCX files are available. Those older cases retain their original source data (their checklists contain 21, 16 and 19 items respectively). They have not been relabelled as the new twenty-item packs. No opioid case, naloxone dose guidance, new recovery profile, synthetic investigation result, references or example SBAR has been invented.

Required to complete clinical import: attach the complete opioid, STEMI, PE and pneumothorax faculty packs, including all pages, tables, report cards and revision/pilot appendices. PDF sources need a checked text extraction; the supplied extractor supports DOCX.

## Implemented independent functionality

- Compatible optional facultyPack sections retain opening handover, equipment, history answers, actor/nurse instructions, discussion questions, teaching points, example SBAR, references, revision notes, pilot checklist and original text.
- Faculty-pack checklist recording never changes physiology; legacy reviewed responses are retained for existing scenarios.
- Interventions distinguish requested, prescribed, administered, performed and faculty-confirmed effective. Effective is rejected until delivery is recorded. Repeated command identifiers and repeated delivery-state submissions are idempotent.
- Reviewed branches declare source provenance, qualification notes, partial observation targets and delivered-intervention conditions. Recovery requires an effective intervention and explicit faculty confirmation. Automatic playback is limited to explicitly reviewed timed deterioration; early effective rescue can suppress deterioration.
- Explicit reviewed time jumps are applied once with confirmation. A thirty-minute fixture verifies recurrence; no such rule has been installed in a real case without its pack. Paused sessions stay paused and scheduled progression waits for resume. Time jumps do not implicitly invent recovery or finish a gradual physiological ramp.
- Stage changes preserve delivered oxygen. Device and flow are stored independently from saturation. Assisted ventilation is recorded separately from spontaneous RR. Observation and rhythm overrides remain pinned until released.
- Supplied synthetic text reports can be released privately, including immediately on request. Images/PDFs remain separate approved uploads. Only a released report/image can be retrieved by a joined monitor.
- Phone sections: Briefing, History, Findings, Investigations, Checklist and Debrief. Existing Actions/Patient/Control tabs, stage controls, session controls and export remain.
- Debrief adds intervention statuses, branch/observation/oxygen events, teaching sections and outstanding objectives. There are no pass marks or validation claims.

## Pack mapping workflow

1. Extract each original DOCX without changing numeric values, units or doses: `npm run packs:extract -- PACK.docx`.
2. Map the complete content into the existing four-stage Scenario JSON. Keep document text exactly as written. Put all twenty learner actions into their appropriate stage arrays; earlier and future actions remain available.
3. Add optional interventions, branches, timeJumps and investigation report/release fields. Branch `provenance` is `original` or `faculty-authored`; `sourceNote` states the exact clinical qualification. Never infer recovery observations or rhythm from a diagnosis.
4. Run `npm run packs:verify -- REVIEWED.json`; this checks schema and required pack sections, not clinical accuracy. Compare every stage/branch profile and exact medication guidance against the document and complete faculty pilot review.
5. Use the instructor editor's Import reviewed scenario JSON and Save new version controls. Backend versioning retains each running session's starting snapshot. Source originals stay private in the backend, outside monitor projections and hosted assets.

## Branch schema example (nonclinical structure)

A branch has id/name/kind, reviewed=true, provenance/sourceNote, and optional observations, findings/cues, durationMs, conditions and requireConfirmation. Conditions are conjunctive: actions, interventions[{id,state}], unlessEffective, fromBranches, stage (zero-based), afterMs and clock (session/stage/branch). Recovery must have a condition with state=effective. Treatment and recovery selections require confirmation even when requireConfirmation is omitted. Automatic deterioration needs explicit afterMs; suggested document windows should be retained as teaching notes unless faculty review authorises a timer.

Use separate intervention identifiers for initial and recurrent treatment episodes when the pack specifies repeat administration. The engine does not infer doses or count repeat deliveries as new treatment automatically.

Apply only the new monitor-delivery migration to an already installed Supabase project; do not rerun the initial setup file over existing policies. Deployment remains Firebase Spark Hosting plus Supabase Free. Full pack-content and physical-device verification are outstanding.

## Verification performed for this update

- TypeScript and production build pass. Twenty-six engine tests pass, including all twelve older source profiles and the new nonclinical branch fixtures.
- PostgreSQL security tests pass with the new monitor delivery-field constraint.
- Extended Firebase emulator integration passes for private pack fields, confirmed recovery, a paused time jump, immediate text-report release and denied monitor controls.
- Deployed Supabase integration passes for intervention states, confirmed recovery, time jump, private fields and existing session restrictions. Immediate supplied text-report release passed against the deployed backend, including exact UTF-8 text and rejected stranger access.
- A startup timeout and a slow Chromium action wait occurred in the constrained environment; retries use longer discovery/action waits. The extended browser run then found a three-pixel header overflow at 375px; the phone header was changed to two rows with accessible touch targets.
- WebKit downloaded but cannot run because the environment lacks required Linux libraries; package indexes and root installation are unavailable. No Safari or physical iOS/Android verification is claimed.

The deployed Chromium controller/monitor run passed at 375, 390 and 430px after the header fix, with 14 Realtime update frames. It covered sections, stage profiles, pinned SpO2, oxygen persistence, separate assisted ventilation, pause/resume and offline/reconnect. A second-session test exposed a retained QR panel; starting a new session now clears the previous snapshot and QR state. Final targeted live fixture UI verification passed: a new session resets the QR panel, prescription does not change RR, confirmed delivered rescue selects recovery, an explicit thirty-minute jump keeps the session paused, private debrief sections render, and 375/390/430px layouts fit. The deployed backend also rejected a faculty-pack checklist response attempting to change physiology. Disposable accounts, sessions and fixture versions were removed.

Deployment succeeded for the monitor-field migration, authenticated Supabase Edge Function/shared engine, and existing Firebase cidsimroom Hosting target. Website: https://cidsimroom.web.app. The four new pack imports remain blocked on their absent attachments.

## GitHub publication status

The existing app and update are committed locally on feature/faculty-pack-support. Both authenticated Git push and the connected GitHub branch-creation API were rejected with HTTP 403 (Resource not accessible by integration). No remote commit or PR is claimed. Enable repository write access (Contents: read/write) for the GitHub connection on Confused-Indian-Doctor/SimRoom, then push this branch and open its PR. Local source and Git-history delivery archives preserve the work.
