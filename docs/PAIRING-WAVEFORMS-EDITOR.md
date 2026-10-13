# Monitor pairing, signals and visual authoring

This update continues the existing CIDSIMROOM application. Supabase Free remains the production backend; Firebase Spark remains the hosting service. No paid infrastructure has been introduced.

## Use on the monitor and phone

1. Sign in on the tablet/computer and choose **Start on this monitor** for a case.
2. Choose **Connect phone controller**. Scan the large QR using the phone's normal camera.
3. Sign in with an approved instructor account if needed. The link pairs automatically to that session. Installation is unnecessary.
4. Alternatively open `/controller` and enter the eight-character pairing code.

QR tokens contain 128 random bits, expire after two minutes, are hashed in the database, and are consumed once. Regenerating invalidates the previous token and code. Codes are also hashed; faculty redemption attempts are rate limited. PostgreSQL locks the session during redemption and command commits. The first direct owner command also atomically claims its device. Only one authenticated faculty user/device is primary; replacement requires explicit confirmation. A persistent random device identifier supports refresh and is checked against the server-side grant; it is not sufficient to authorise control without the authenticated faculty account. Browser storage is used for that identifier and session restoration, not session synchronisation.

Monitor members receive only the public physiological projection and released result names. They cannot retrieve session snapshots, histories, checklists, faculty answers, pairing hashes or controller grants. A paired faculty account can read the private session only while its grant remains active. Old devices cannot issue commands after takeover. Disconnect revokes the paired device, and ending a session removes challenges and primary grants. The owner can explicitly end the session from the monitor; ordinary monitor viewers cannot.

Both views show pairing/connection status. Primary controller heartbeats occur every five seconds; controller presence becomes disconnected after twenty seconds without a heartbeat. Monitor observations become stale after fifteen seconds without an authoritative update, and waveform playback stops. Refresh/reconnect uses the backend snapshot and clock. Faculty authentication still applies.

## Synthetic signals

`src/signals.js` contains the independently tested signal generator. The reference beat is the QRS R peak. Normal sinus rhythm includes P, PR interval, narrow QRS, ST baseline and T. The pleth has a fast upstroke, rounded peak, diastolic descent and small notch, beginning 200 ms after the QRS reference. Normal, poor and absent perfusion are independent of saturation. VF/asystole suppress perfusing pulses and pulse sound. Clean and artefact signal settings are available.

A shared simulation-time reference seeds local timing; no sample stream is transmitted. Integrated beat phase and a short rate transition preserve continuity when HR changes. Stable canvas components retain their history through React rerenders, resize their backing buffers only when geometry/DPR changes, and draw an elapsed-time sweep with an erase gap. Pausing or stale state freezes playback. Returning from backgrounding clears the missing signal interval without emitting catch-up beeps. Audio starts only after the sound button's user interaction.

These are educational synthetic bedside signals, not diagnostic ECGs or measured physiology. A normal single-lead trace does not exclude STEMI. Diagnostic twelve-lead investigations and approved image uploads remain separate. Supported rhythms are sinus, VF and asystole; unspecified source rhythms remain unset. Numerical tests establish the implemented timing and signal behaviour, not clinical device certification.

## Authoring and progression

The editor uses selectable stage cards in Outline or Flow view. Flow cards name configured destinations and display readable rules. Edit stage names, descriptions, observations with units, oxygen device/flow, rhythm, perfusion, consciousness, findings, cues, expected actions, objectives, investigation reports/releases, branches and debrief points without JSON. Existing source notes and faculty qualification text remain attached. Edited observation profiles retain their original profile metadata and are labelled faculty-authored.

Add, duplicate, reorder and delete stages; incoming/outgoing connections are identified before deletion. Indexed legacy condition destinations are remapped on reorder/duplicate. Deletion is blocked when branch/result dependencies would silently become unconditional. Undo/redo and unsaved-leave warnings apply. Private drafts are separate from saved versions. Duplicate scenario assigns a new identifier. Every saved version is immutable; a running session keeps its copied starting version.

The transition builder supports action completion, confirmed effective intervention, elapsed stage time and faculty confirmation; all/any matching; named stage, specified observation, approved-result release and cue effects; immediate/gradual response; and explicit alternatives. An alternative is evaluated only at an explicitly configured timer decision point. Unconfigured rules remain in the stage. Rule summaries appear before saving. Backend validation rejects missing targets, duplicate/conflicting conditions, invalid settings and impossible observation values. Unreachable stages and cycles are flagged. Each rule is applied at most once per session; no implicit deterioration is created.

The isolated preview uses an in-memory copy of the same engine. Preview action, intervention, stage, confirmation and clock commands never call a live session. Pausing freezes its simulation clock and gradual changes. The running-session progression panel shows the current stage, visited stages, outstanding actions, action/prompt times, configured response explanations, branches, findings and cues. Existing Yes / Not yet, prompt recording, intervention lifecycle, investigation controls, notes and debrief/export remain available.

## Deployment and verification

Existing installations apply **only** the new migrations:

```sh
npx supabase db query --linked --project-ref qfghkzeifqhabxxdmabq --file supabase/migrations/202610130002_pairing.sql
npx supabase db query --linked --project-ref qfghkzeifqhabxxdmabq --file supabase/migrations/202610130003_primary_claim.sql
npm run supabase:prepare
npx supabase functions deploy simroom --project-ref qfghkzeifqhabxxdmabq --use-api
npm run build
firebase deploy --only hosting:cidsimroom --project simroom-60e9f
```

The full `supabase/setup.sql` is for fresh installations, not rerunning on an existing database. Pairing and private draft persistence use the production Supabase adapter. The Firebase emulator retains the original owner-controlled sessions and supports engine/editor preview/version regression; it does not implement the new pairing grant flow or private drafts. The UI identifies that distinction and disables unavailable draft controls.

Commands:

```sh
npm test
npm run typecheck
npm run build
npm run test:supabase:sql
FUNCTIONS_DISCOVERY_TIMEOUT=60 npm run test:integration
```

Authenticated live checks obtain administrator credentials from the official Supabase CLI through stdin, use disposable accounts and remove their data. No service-role secret belongs in the browser or repository:

```sh
npx supabase projects api-keys --project-ref qfghkzeifqhabxxdmabq --reveal --output json | NODE_USE_ENV_PROXY=1 node tests/pairing-live.mjs
npx supabase projects api-keys --project-ref qfghkzeifqhabxxdmabq --reveal --output json | NODE_USE_ENV_PROXY=1 SIMROOM_PAIR_BROWSER=https://cidsimroom.web.app node tests/pairing-live.mjs
```

Executed results are recorded in `docs/VERIFICATION.md`. Screenshots: `docs/screenshots/pair-monitor.png`, `pair-controller.png` and `visual-editor.png` when the corresponding browser phase passes. Chromium mobile viewports and QR image decoding are browser automation; they are not physical camera/device tests. Physical Android, iPhone, iPad and Safari testing remains outstanding, including sound, screen-awake and installation.

## Source gap and practical limits

Only the older STEMI, PE and pneumothorax sources are present. The four later complete faculty packs, including postoperative opioid toxicity, were never available in this workspace. Their import and clinical qualifications cannot be verified or supplied without the documents. The older three cases and all twelve original observation profiles are retained. No opioid dose guidance, post-decompression recovery or other missing clinical branch has been invented.

Guided timers are evaluated on accepted commands and controller heartbeat ticks. There is no independent background scheduler; background/disconnected controllers may defer evaluation until reconnect. The authoritative simulation clock continues while running and freezes while paused. Short HR changes have a brief smooth waveform-rate transition rather than an instantaneous beat discontinuity. Provider free-tier quotas and inactivity rules still apply.
