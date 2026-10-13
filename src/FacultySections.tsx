import type { Scenario, Session } from "./types";
export function PackSections({
  scenario,
  sections,
}: {
  scenario: Scenario;
  sections?: string[];
}) {
  const labels: Record<string, string> = {
    openingHandover: "Learner opening handover",
    equipment: "Equipment",
    historyAnswers: "Answers supplied when asked",
    actorInstructions: "Actor instructions",
    nurseInstructions: "Nurse instructions",
    debriefQuestions: "Discussion questions",
    teachingPoints: "Teaching points",
    exampleSBAR: "Example SBAR",
    references: "Clinical references",
    revisionNotes: "Revision notes",
    pilotChecklist: "Faculty pilot checklist",
    originalText: "Complete original pack",
  };
  return (
    <>
      {Object.entries(scenario.facultyPack || {})
        .filter(([k, v]) => v && (!sections || sections.includes(k)))
        .map(([k, v]) => (
          <section className="panel" key={k}>
            <h2>{labels[k] || k}</h2>
            <pre className="source-text">{v}</pre>
          </section>
        ))}
    </>
  );
}
export function InterventionControls({
  session,
  command,
}: {
  session: Session;
  command: (type: string, data?: Record<string, unknown>) => Promise<void>;
}) {
  if (!session.scenario.interventions?.length) return null;
  return (
    <section aria-label="Delivered interventions">
      <h2>Interventions</h2>
      <p className="help">
        Request, prescription, delivery and effectiveness are separate.
        Effectiveness is confirmed by faculty; recording a request or
        prescription does not change observations.
      </p>
      {session.scenario.interventions.map((i) => (
        <div className="panel" key={i.id}>
          <h3>{i.name}</h3>
          {i.guidance && <pre className="source-text">{i.guidance}</pre>}
          <div className="intervention-buttons">
            {(
              [
                "requested",
                "prescribed",
                "administered",
                "performed",
                "effective",
              ] as const
            ).map((state) => (
              <button
                key={state}
                className={
                  session.interventions?.[i.id]?.[state] ? "selected" : ""
                }
                disabled={!!session.interventions?.[i.id]?.[state]}
                onClick={() => {
                  if (
                    state === "effective" &&
                    !confirm(
                      "Confirm this intervention was delivered and clinically effective. Recognition or prescription alone is insufficient.",
                    )
                  )
                    return;
                  void command("intervention", {
                    intervention: i.id,
                    state,
                    confirmed: state === "effective",
                  });
                }}
              >
                {session.interventions?.[i.id]?.[state] ? "✓ " : ""}
                {state === "effective" ? "Confirm effective" : state}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
export function BranchControls({
  session,
  command,
}: {
  session: Session;
  command: (type: string, data?: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <>
      {!!session.scenario.branches?.length && (
        <section className="panel">
          <h2>Branches</h2>
          <p className="help">
            Recovery requires a delivered intervention and confirmed
            effectiveness. Stage windows are teaching suggestions, not
            compulsory delays.
          </p>
          {session.scenario.branches.map((b) => (
            <div className="branch-card" key={b.id}>
              <h3>
                {b.name} <small>{b.kind}</small>
              </h3>
              <p className="help">
                {b.provenance === "original"
                  ? "Original pack profile"
                  : "Faculty-authored simulation branch"}{" "}
                · {b.sourceNote}
              </p>
              <button
                className={session.branch === b.id ? "selected" : ""}
                onClick={() => {
                  const needs =
                    b.requireConfirmation || b.kind !== "deterioration";
                  if (
                    needs &&
                    !confirm(
                      "Confirm clinical effectiveness and that this branch is appropriate now.",
                    )
                  )
                    return;
                  void command("branch", { branch: b.id, confirmed: needs });
                }}
              >
                {session.branch === b.id ? "Current branch" : "Select branch"}
              </button>
            </div>
          ))}
        </section>
      )}
      {!!session.scenario.timeJumps?.length && (
        <section className="panel">
          <h2>Simulated time jumps</h2>
          <p className="help">
            An explicit teaching time jump changes the simulation clock. While
            paused, scheduled progression stays frozen until resume.
          </p>
          {session.scenario.timeJumps.map((j) => (
            <button
              key={j.id}
              disabled={
                session.timeJumps?.includes(j.id) || session.status === "ready"
              }
              onClick={() => {
                if (
                  confirm(
                    `Apply ${j.label}? Advance simulated time by ${j.advanceMs / 60000} minutes.`,
                  )
                )
                  void command("timeJump", { jump: j.id, confirmed: true });
              }}
            >
              {j.label} · +{j.advanceMs / 60000} min
            </button>
          ))}
        </section>
      )}
    </>
  );
}
