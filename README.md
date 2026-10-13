# CIDSIMROOM

React + TypeScript + Vite clinical simulation PWA, with a Supabase Free production backend and a retained Firebase emulator development backend. Production build, TypeScript checks, engine tests, Firebase emulator integration and separate Chromium browser context acceptance pass. Clinical review and physical-device checks remain before teaching use.

## Local setup

Requires Node 22+, Java 21+ and npm.

```bash
npm install
npm install --prefix functions
cp .env.example .env.local
npm run emulators
```

In a second terminal:

```bash
npm run seed
npm run dev
```

Open http://localhost:5173. Sign in as `instructor@simroom.test` with `SimRoom123!`. Create a session, select Connect monitor, and open the QR/link in a separate browser context. No account is needed for the monitor; it uses anonymous Firebase authentication and a backend-granted session membership.

Phone access during local development requires emulator hosts accessible from that phone. Set VITE_EMULATOR_HOST to the development machine's LAN address, configure emulator bind hosts appropriately on a trusted network, and restart Vite. HTTPS is required for installed PWA, wake lock and other secure-context features outside localhost. Never expose emulator ports on the public internet.

## Architecture

Production uses Supabase Free Auth, Postgres/RLS, Realtime, private Storage and an authenticated Edge Function. The following Firebase services remain available for isolated emulator development:

* Firebase Auth: email/password instructor authentication, anonymous monitor identity. An administrator must grant the `instructor: true` custom claim; signing up alone grants no control.
* Firestore: private scenarios, private source archive, immutable scenario-version history, owner-only session snapshots, monitor-only projection, monitor membership, and join codes. Live listeners synchronise accepted state.
* Callable Functions: session creation/join, owner-only transactional commands, reviewed scenario saves, and access-checked investigation downloads. Clients cannot directly write session state.
* Storage: faculty-supplied images/PDFs, private paths with no public download URLs. Released results are fetched through an authorised callable.

All clinical source data stays in functions/content and the private backend database, outside public assets and the frontend bundle. Running sessions contain a copy of the starting version. The backend uses wall-clock timestamps and stores accumulated active time on pause. Commands carry identifiers; accepted duplicate identifiers do not repeat effects. Instructor heartbeat calls update the monitor projection every five seconds and evaluate reviewed guided transitions. Controller loss therefore stops guided evaluation; no independent scheduler has been implemented.

Monitor traces are generated locally. An unspecified rhythm renders no ECG rhythm trace; faculty may explicitly select a rhythm. The diagnostic 12-lead slot remains separate. Oxygen delivery is independent of SpO2 and can be pinned.

## Clinical content provenance and gaps

STEMI, PTX and PE checklists and histories are extracted from the supplied DOCX files. Verbatim paragraph content is in the private original archive; all six DOCX files are retained under functions/content/source-documents. Re-import with python scripts/import.py (or set SIMROOM_SOURCE_DIRECTORY to another folder). Observations match all twelve profiles in the development brief. PTX originals were supplied later and the brief-derived draft has been replaced with their verbatim actions, history, findings and faculty cues. The PTX stage 3 cue describes a possible 94% saturation on 15 L/min, while stage 4 gives 84% on 15 L/min; that branch and timing require review. Mockup image files were also missing. Objectives and general equipment preparation are application authoring content and require local review.

Timers, rhythms, transition combinations, oxygen branches and treatment responses are unset. No ECG, CXR, ABG report, medication dose or post-decompression recovery profile has been invented. Stage advancement in manual mode deliberately applies the source stage profile; faculty decide when the profile is appropriate. The STEMI stage-3 “hypotension” wording accompanies 116/76, needing faculty clarification. The source's history-gated ECG cue is preserved as source wording but is not a software lock. PTX recognition and performed decompression stay distinct. PE help calls/SBAR do not change physiology.

The visual scenario editor is the primary authoring interface. The underlying schema retains legacy reviewed transitions; an example (values are faculty settings, not imported clinical facts):

```json
{"reviewed":true,"combination":"all","actions":["replace-with-action-id"],"requireConfirmation":true}
```

Optional `afterMs` and `durationMs` are milliseconds. Use null for unspecified settings. A reviewed action response uses `{"reviewed":true,"observations":{"hr":100}}`; actual response values require clinical review.

## Verification

```bash
node --check functions/index.js
node --check functions/engine.js
node --test tests/engine.test.mjs
npm run typecheck
npm run build
npm run test:integration
npm run test:browser
```

Executed: production build (including TypeScript), backend syntax checks, the dependency-free engine test file (15 individual tests), Firebase emulator integration and separate Chromium phone/desktop browser contexts passed. Covered source profiles, PE physiology, PTX recognition versus performance, prompt/Not yet separation, pins and oxygen, pause/resume, duplicate commands, gradual playback, monitor projection privacy, absent investigation release, reviewed guided conditions and starting-version snapshots.

Emulator integration verifies owner-only commands, monitor/faculty separation, unauthorised direct writes, stage profiles (including all four original PTX stages), pinned overrides, independent gradual changes, action/prompt statuses, duplicate commands, pause/resume, immutable session versions, private Storage access and requested/released investigations using a neutral test fixture. The browser test verifies QR-code joining, real updates across separate contexts, stage changes, a pinned saturation, SBAR and prompt recording, pause/resume, offline/reconnect and phone layout. Screenshots are in docs/screenshots, including the private original PTX history and scenario editor. Emulator Functions ran under host Node 24; production is configured for Node 22.

The Firebase production backend was not deployed; production now uses Supabase. Physical Android/iPhone/iPad tests have not been executed. Chromium's mobile viewport is not a physical phone or Safari test. Production-preview tests also passed for service worker control, the standalone manifest and offline app-shell reload. Reproduce with `npm run test:pwa`. The browser script expects Chromium at /usr/bin/chromium (or SIMROOM_CHROMIUM_PATH).

Outstanding acceptance includes physical-device backgrounding, clock skew under variable latency, broader concurrency, prolonged sessions and growing JSON event history, QR usability, rotation, sound, screen awake, Safari/Android installation and reviewed clinical workflows. Monitor-local alarm acknowledgement affects only that display; instructor acknowledgement updates shared alarm state. Reset retains audit events.

## Configured project

The production build is configured for simroom-60e9f using .env.production. Its public Firebase web configuration is supplied by the project owner. npm run build emits dist for that project. npm run build:emulator emits dist-emulator for demo-simroom; npm run test:pwa uses that isolated output. The development server remains emulator-backed. Analytics is not activated.

## Free production deployment

Use Firebase Spark Hosting for the app shell and Supabase Free for the backend. No billing upgrade is required. Supabase Auth handles verified faculty accounts and anonymous monitor identities; Postgres row-level security separates private owner sessions from monitor projections; Realtime synchronises accepted state; Edge Functions validate commands and atomically commit authoritative state; private Storage holds investigation assets.

```bash
npm run supabase:prepare
npm run test:supabase:sql
npx supabase login
npx supabase db query --linked --project-ref qfghkzeifqhabxxdmabq --file supabase/setup.sql
npx supabase config push --project-ref qfghkzeifqhabxxdmabq
npx supabase functions deploy simroom --project-ref qfghkzeifqhabxxdmabq
```

Approve the instructor email through an administrator SQL query: `insert into public.faculty_invites(email) values ('approved-email@example.com');`. Only approved, email-confirmed accounts receive faculty access. Users choose their passwords directly in the app and confirm their email. Never put service-role keys or passwords in frontend configuration.

Set VITE_BACKEND=supabase, VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the public project settings. Keep VITE_BACKEND_READY=false until deployment and live acceptance pass, then enable it and run:

```bash
npm run build
firebase deploy --only hosting --project simroom-60e9f
```

Do not deploy Firebase Functions or enable Blaze for this free architecture. The retained Firebase emulator adapter supports the existing independent local integration suite.

PWA caches app assets only. Offline screens cannot control another device. A monitor marks old observations stale after 15 seconds without an authoritative update.

## Current hosted state

Frontend: https://cidsimroom.web.app. Supabase project: qfghkzeifqhabxxdmabq. Backend SQL, private source cases, Edge Function and Auth configuration are deployed. Backend live integration checks passed and Hosting now enables instructor sign-in. Approved instructor email: alameenashraf@gmail.com. Create faculty sign-in, choose a password on the website, confirm the email, then sign in. Separate deployed browser checks are documented in docs/VERIFICATION.md.

Supabase SQL security tests run against isolated Postgres with simulated Auth/Storage roles. They are not a deployed Supabase or full local Supabase-stack test. TypeScript checks and 16 engine tests pass. Previously completed Firebase emulator/browser tests remain evidence for that adapter, not proof of deployed Supabase synchronisation. Physical Android/iPhone/iPad and Safari testing remains outstanding.

The CLI currently probes TCP even for Management API SQL queries. In this HTTP-only execution environment, setting SUPABASE_DB_PASSWORD=management-api-only-unused for the `db query --linked` command prevents its unnecessary temporary-role verification; it is an unused placeholder, not a database credential. Query authorisation still uses the official CLI login. On a normal workstation the documented command needs no workaround.

For repeatable deployed checks, install Supabase CLI 2.120.0, sign in with the official CLI, and run `npm run test:supabase:live`. Set SIMROOM_LIVE_BROWSER=https://cidsimroom.web.app to include separate browser contexts. In this proxy environment Node also needs NODE_USE_ENV_PROXY=1. The test uses disposable accounts, never emails students, and removes its sessions/assets/scenarios. The SQL setup file is an initial installation; apply it once, then use reviewed migrations for future changes. Free service usage remains subject to the providers’ quotas and Supabase inactivity policy.

## Faculty pack support update

See [FACULTY-PACK-UPDATE.md](docs/FACULTY-PACK-UPDATE.md) for the extended scenario schema, import workflow and source-material gap. This update adds confirmed intervention states, reviewed branches, explicit time jumps, independent oxygen/assisted ventilation, supplied text investigations and phone sections while preserving the existing app. The four new complete packs are missing; the three older source cases remain unchanged and no opioid case or new medication guidance has been invented.

Existing production installations apply `supabase/migrations/202610130001_monitor_delivery.sql`, prepare and deploy the shared engine/Edge Function, then deploy Hosting. Initial installations can use the regenerated setup.sql. Do not rerun initial setup on an existing installation. A longer `FUNCTIONS_DISCOVERY_TIMEOUT=60` may be needed when running Firebase emulator checks in a constrained environment.

## Monitor-to-phone pairing and visual editing

Select **Start on this monitor**, then **Connect phone controller**. Scan with a normal phone camera and sign in as an approved instructor: the single-use, two-minute QR pairs that exact session. An eight-character code is available as a fallback. Primary-controller takeover is confirmed explicitly. The app now has continuous synthetic ECG/pleth, independent perfusion/artefact controls, a scenario progression panel and a visual Outline/Flow editor with rule builder, private drafts, undo/redo and an isolated preview. Running versions are preserved.

See [pairing, signals, editor and deployment instructions](docs/PAIRING-WAVEFORMS-EDITOR.md). Existing installations apply migrations `202610130002_pairing.sql` and `202610130003_primary_claim.sql` rather than rerunning initial setup. The retained Firebase emulator does not implement the new Supabase pairing/draft operations. Physical Android/iOS tests and the four missing new faculty packs remain outstanding.
