# Authoritative simulation engine

The existing React/Vite/PWA, Supabase synchronisation and QR controller permissions are retained. `functions/engine.js` and `functions/domains.js` are pure transport-independent modules, copied into the browser and Edge Function by the prepare script. Commands use backend time, monotonic revisions and a transactional compare-and-swap. Successful command IDs retain a content fingerprint: retrying a dose cannot administer it twice, and changing its payload under the same ID is rejected.

## State and ownership

`engine.patient` holds the authored baseline, supported mechanisms, manual pins and resolved ownership. `engine.measurements` holds attached sensors and separately acquired results. `engine.learners` holds completion/prompt/correction history, actual administrations and unsupported actions. `engine.teaching` holds objectives, enabled branches and the outcome. `engine.session` holds the seed, sequence and authoritative time reference. The existing root observation/action fields remain compatibility projections for existing controls.

No physiological equations or universal medicine responses are added. Authored set models resolve by explicit priority, additive models apply explicit numeric deltas, and faculty pins take precedence. Equal-priority set models are rejected at scenario validation; ambiguous same-priority teaching transitions reject safely at runtime. Immediate reviewed rules update the authored basis, which remains subordinate to active model targets and faculty pins. Unspecified mechanisms remain null. Oxygen delivery and assisted ventilation remain separate from saturation and spontaneous RR. A prescription does not establish delivery or effectiveness.

Scenario engine version 2 treats stage changes as teaching changes; explicit profile application remains available through the command API. The existing source cases retain version 1 manual observation-profile playback. Neither edit changes a running session's immutable starting definition.

## Clock and scheduler

Simulation time advances only while running, except for a reviewed, explicitly confirmed time jump. Scheduled onset, linear authored response, duration, wear-off, recurrence, result availability, cuff acquisition and rule events are processed chronologically. Suggested teaching windows do not schedule deterioration. All/any condition groups, effective-intervention recovery guards, finite repeat/cooldown policies, cancellation and conflict detection prevent accidental loops. A threshold crossing in an authored linear response is resolved to millisecond precision, not a clinical physiological solver.

A Supabase Cron job invokes an authenticated backend worker every ten seconds only while sessions are running. The scheduler token is generated privately, stored in Edge secrets and Supabase Vault, and never embedded in the app or database's public tables. The worker restores state and executes scheduled events at their simulation timestamps, even if the controller is backgrounded. Public delivery may be up to one worker interval later. Faculty commands use the same scheduler immediately. This is not a high-frequency physiological telemetry service.

Run `node scripts/configure-scheduler.mjs` using an existing Supabase CLI login to install/rotate the worker secret and job. It requires permission to enable pg_cron/pg_net and use Vault. There is no paid physiology service dependency.

## Measurement and audit

NIBP retains its last acquired value and simulation timestamp until a new cuff cycle completes; actual BP can differ. Detached/lost sensors remain distinguishable from asystole. Each investigation request creates a separate instance; acquisition captures actual observations, mechanisms, oxygen and ventilation. Authored report variants are selected then, not after later treatment. Availability and release are separate, missing assets stay unavailable, and public payloads contain only released identifiers.

Private database command and attempt ledgers preserve commands beyond the in-state 500-command replay cache. Authentication lifecycle events record pairing, takeover and disconnection separately. RLS restricts all three ledgers to authorised faculty. Backend replay reconstructs the command log from its starting snapshot. Corrections retain history; they cannot undo a dose. Checkpoints create local what-if sandboxes without sending commands to a live session. Existing JSON debrief exports now include domains, checkpoints, seed and the backend audit.

## Clinical content limitation

Only the original six STEMI, PE and PTX source documents are available in this workspace. The requested four replacement faculty packs, including the opioid case, are absent. No naloxone dose, recurrence interval, recovery observation or synthetic clinical report has been fabricated. Scheduler tests use explicitly nonclinical reviewed fixtures; they establish engine behaviour, not validation of naloxone kinetics or the four requested clinical packs. Import those complete packs using the existing extraction/import verification workflow before approving their authored response models.
