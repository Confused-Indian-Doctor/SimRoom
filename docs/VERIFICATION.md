# Verification status

Verified in this environment:

- TypeScript check and Vite production build.
- 16 engine tests, including all 12 source observation profiles, manual pins, independent gradual changes, reviewed responses, clock/pause behaviour, retries, PE help-call physiology, PTX recognition versus performed decompression, and scenario validation.
- Firebase Emulator Suite: owner commands, rejected monitor commands, restricted faculty reads, rejected direct writes, monitor-only projection, source PTX stages, original PTX history, version snapshots, requested/released investigation states, and private Storage access. A neutral nonclinical SVG fixture was used for asset permission checks.
- Separate Chromium contexts: phone controller at 390×844 and monitor at 1366×900, code joining, stage updates, pinned SpO2, action and prompt recording, pause/resume and offline/reconnect.
- Production-preview PWA: service worker control, standalone manifest and offline shell reload. This does not provide offline cross-device control.
- Screenshots captured from actual browser sessions using the emulator-backed production preview: library, phone library, controller, actions, monitor, debrief, PTX private patient information, and editor.

Not verified:

- Physical Android, iPhone or iPad installation, audio, wake lock, backgrounding and rotation.
- Safari or Samsung Internet behaviour.
- Extended sessions and growing JSON event history or independent controllers competing from multiple instructor tabs.

Clinical review remains necessary for rhythms, timers, transition combinations, oxygen-response branches, treatment responses and uploaded investigation assets. PTX stage 3 mentions a possible SpO2 response of 94% on 15 L/min; stage 4 specifies 84% on 15 L/min. STEMI stage 3 calls BP 116/76 hypotension. Both discrepancies are explicitly preserved for review. No doses, diagnostic images, numerical ABG reports or post-decompression recovery observations were invented.

Emulator Functions ran with host Node 24; deployment configuration targets Node 22. The production build emits a large-bundle warning (about 264 KB gzip); it succeeds.

Production is hosted at https://cidsimroom.web.app using Firebase Spark Hosting and Supabase Free. Firebase billing remains disabled. Supabase Auth configuration, the Edge Function, private case/source data, database RLS and private Storage are deployed. No Firebase Functions were deployed.

Supabase local checks pass against isolated PostgreSQL 17 with simulated Auth/Storage roles: owner/monitor access, denied private writes and privileged calls, atomic revision checks, immutable snapshots, private assets and verified-email faculty invite/revocation behaviour. These are not full local Supabase-stack tests.

Deployed Supabase integration passes with disposable verified faculty and anonymous monitor/stranger accounts: authentication, all three source cases, rejected private reads and writes, denied monitor controls, stage profiles, pinned observations, SBAR/prompt recording with no physiology response, idempotent commands, pause/resume, immutable starting-version snapshots and access-checked investigation release. A neutral SVG fixture was used; test data and accounts were removed. Administrator credentials were passed in memory from the official CLI and were not embedded in source or browser configuration.

After adapter migration, production and emulator builds passed again. Separate-context Firebase emulator browser regression passed for code joining, live stages, pins, SBAR/prompt recording, pause/resume and offline/reconnect. Deployed Chromium checks passed against the actual Hosting URL with separate 390×844 controller and 1366×900 monitor contexts: faculty sign-in, session-code joining, stage values, pinned SpO2, pause/resume, stale observations during offline state, reconnection and phone layout. Eight Supabase Realtime postgres_changes frames were observed in the final run. Screenshots: docs/screenshots/live-controller.png and live-monitor.png. The test observer was corrected to decode the SDK’s newer array-form WebSocket protocol; this required no application change. Disposable test records and accounts were removed after the final run. Physical devices remain untested.

Branding updated to CIDSIMROOM: production TypeScript/build passed and Firebase Hosting deployment completed.
Hosted Chromium verified the CIDSIMROOM heading, browser title, manifest name and phone layout. Screenshot: docs/screenshots/cidsimroom-sign-in.png.

Hosting address changed to https://cidsimroom.web.app on 2026-10-13. Firebase target cidsimroom is deployed. Supabase Auth configuration was applied after renewed official CLI authorisation: site_url is https://cidsimroom.web.app, and the new domain is allowed for email confirmation redirects. Existing accounts use the same backend.
Chromium verified the new cidsimroom.web.app address, CIDSIMROOM sign-in heading, browser title, PWA name and phone layout.
Post-update Supabase config comparison confirmed no outstanding declared changes, including the new Auth site URL and allowed redirects. Email delivery was not triggered for this configuration check.

## Faculty-pack engine/interface update (2026-10-13)

See FACULTY-PACK-UPDATE.md for the complete test/deployment record and missing-source limitation. Twenty-six engine tests, TypeScript/production build, PostgreSQL RLS checks, extended emulator integration, deployed Supabase API checks and targeted live Chromium phone/monitor tests passed. The live site is updated. The four complete new packs were absent, so no four-case content comparison or new opioid case is claimed. WebKit/Safari and physical-device checks remain unexecuted.

## 2026-10-13: secure pairing, continuous signals and visual editor

- **41 automated tests passed** (`npm test`): the existing 26 clinical-source/engine regressions plus waveform timing/morphology/perfusion/background-resume tests, all/any rule matching, pause/timers, explicit alternatives, effective-intervention gating, stage editing/remapping, graph warnings, immutable preview snapshots, active response pin release and reset cleanup.
- **TypeScript and production build passed.** The final build emitted the current PWA app shell; private source scenarios are not bundled.
- **Isolated PostgreSQL tests passed** with simulated Auth/Storage roles, including the original RLS/version/asset checks and new single-use token, fallback, explicit takeover, old-controller rejection, expiry, privileged RPC denial and end-revocation checks. First direct owner commands atomically claim a primary device, and unconfirmed second-device commands are rejected. This is not a full local Supabase-stack test.
- **Firebase Emulator Suite integration passed** for the retained owner-controlled adapter: stage profiles, private/public separation, pins, actions/prompts, retries, pause/resume, version snapshots, private assets and released reports. Host Node 24 ran the Node-22-configured functions. Shutdown logged a Firestore stop warning after the integration script exited successfully. New pairing/draft operations are Supabase-specific and were not claimed as Firebase-emulator features.
- **Deployed Supabase regression API checks passed** using disposable accounts: all three available source cases, private reads, stage values, manual overrides, prompt/action recording, idempotence, pause/resume, immutable versions, effective-treatment branches, time jumps and private result release.
- **Deployed pairing API checks passed**: unrelated-user denial, ordinary-monitor control/faculty-content denial, two-minute expiry, used/regenerated token rejection, delegated faculty reads, explicit takeover, old-device rejection, disconnect revocation, reconnect and end invalidation.
- **Separate Chromium browser contexts passed** against the real Supabase backend, and again against the hosted website: decode the rendered QR image, follow its session-specific token URL, sign in and auto-pair; primary controls update the monitor; phone refresh restores its exact session; pause/reconnect/rotation; 375/390/430px phone widths; sinus canvas changes while running; perfusion/artefact setting synchronisation; mobile stage add/duplicate/reorder/delete, undo/redo, selectable Flow view and isolated preview. Active-controller QR regeneration, explicit takeover by a third browser context, disconnect, and suppression of consumed QR images also passed. The authenticated monitor's End session control also passed. Earlier browser attempts failed because test selectors named controls incorrectly; corrected reruns passed.
- **Deployment succeeded**: migrations `202610130002_pairing.sql` and `202610130003_primary_claim.sql`, shared engine and Edge Function, and Firebase Hosting at https://cidsimroom.web.app. Firebase Functions and paid infrastructure were not deployed.

Screenshots are in `docs/screenshots/pair-controller.png`, `pair-monitor.png` and `visual-editor.png`. Numerical signal tests verify the implemented synthetic timing (including a 200-ms QRS-to-pulse reference delay); they do not certify clinical device accuracy. Real QR-image decoding and separate browser contexts are not physical phone-camera tests. Physical Android/iPhone/iPad, Safari, audio/wake-lock usability and physical PWA installation remain untested.

The four newer complete faculty packs were unavailable, including the opioid pack; their clinical content and case-specific branches cannot be verified. All twelve older source observation profiles and the older three cases remain intact. The later engine update adds an independent authenticated Supabase Cron worker; see [ENGINE-VERIFICATION.md](ENGINE-VERIFICATION.md) for current 65-test, live engine and final hosted browser results. See `PAIRING-WAVEFORMS-EDITOR.md` for setup, architecture and remaining limits.
