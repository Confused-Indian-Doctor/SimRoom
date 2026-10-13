import {timeline} from "./timeline.js";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardList,
  Clock,
  Edit3,
  HeartPulse,
  Monitor as MonitorIcon,
  Play,
  Plus,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  watchAuth,
  signIn,
  signAnonymous,
  logOut,
  currentUser,
  watchScenarios,
  watchSessions,
  watchSession,
  call,
  emulator,
  backendReady,
  registerFaculty,
  provider,
  type BackendUser,
} from "./backend";
import type { Scenario, Session, MonitorState, Obs } from "./types";
import { Monitor, clock } from "./Monitor";
import {
  PackSections,
  InterventionControls,
  BranchControls,
} from "./FacultySections";
import {BackendAudit,PatientNow,EngineControls,InvestigationInstances,ReplaySandbox} from "./EngineControls";
import { ScenarioEditor } from "./ScenarioEditor";
import { Progression } from "./Progression";
import { Pairing } from "./Pairing";
import "./styles.css";
function App() {
  const [user, setUser] = useState<BackendUser | null>(null),
    [instructor, setInstructor] = useState(false),
    [loading, setLoading] = useState(true),
    [cases, setCases] = useState<Scenario[]>([]),
    [sessions, setSessions] = useState<Session[]>([]),
    [selected, setSelected] = useState<Scenario | null>(null),
    [view, setView] = useState("library"),
    [sessionId, setSessionId] = useState(location.pathname === "/controller" ? localStorage.getItem("cidsimroom-controller-session") || "" : ""),
    [session, setSession] = useState<Session | null>(null),
    [monitor, setMonitor] = useState<MonitorState | null>(null),
    [connected, setConnected] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("Actions"),
    [now, setNow] = useState(Date.now()),
    [email, setEmail] = useState(emulator ? "instructor@simroom.test" : ""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(
      new URLSearchParams(location.search).get("code") || "",
    ),
    [note, setNote] = useState(""),
    [duration, setDuration] = useState(0),
    [showQR, setShowQR] = useState(false),
    [notice, setNotice] = useState(""),
    [patientSection, setPatientSection] = useState("History");
  const timing = useRef({ server: Date.now(), local: performance.now() });
  const isMonitor = location.pathname === "/monitor";
  const [pairCode,setPairCode]=useState(new URLSearchParams(location.search).get("pair") || "");
  const [pairMessage,setPairMessage]=useState("");
  async function redeemPair(replace=false){
    try {const r=await call<{id?:string;replacementRequired?:boolean}>("pairRedeem",{token:pairCode.trim().toUpperCase(),replace});
      if(r.replacementRequired){if(confirm("Another phone controls this session. Replace it and revoke its control?"))await redeemPair(true);return}
      if(r.id){localStorage.setItem("cidsimroom-controller-session",r.id);setSessionId(r.id);setView("controller");setPairMessage("Connected to the monitor session");setPairCode("");history.replaceState(null,"","/controller");}
    }catch(e){setPairMessage((e as Error).message)}
  }
  const pairingAttempt=useRef(false);
  useEffect(()=>{if(instructor && pairCode && location.pathname==="/controller" && !pairingAttempt.current){pairingAttempt.current=true;void redeemPair()}},[instructor]);
  useEffect(()=>{if(sessionId && location.pathname==="/controller"){localStorage.setItem("cidsimroom-controller-session",sessionId);setView("controller")}},[sessionId]);

  useEffect(
    () =>
      watchAuth((u) => {
        setUser(u);
        setInstructor(u?.instructor === true);
        setLoading(false);
      }),
    [],
  );
  useEffect(() => {
    const id = setInterval(
      () =>
        setNow(
          timing.current.server + performance.now() - timing.current.local,
        ),
      1000,
    );
    const online = () => setConnected(navigator.onLine);
    addEventListener("offline", online);
    return () => {
      clearInterval(id);
      removeEventListener("offline", online);
    };
  }, []);
  useEffect(() => {
    if (!instructor || isMonitor) return;
    const a = watchScenarios(
      (rows) =>
        setCases(
          rows.sort((a, b) => {
            const order: Record<string, number> = { stemi: 0, ptx: 1, pe: 2 };
            return (
              (order[a.id] ?? 99) - (order[b.id] ?? 99) ||
              a.title.localeCompare(b.title)
            );
          }),
        ),
      (e) => setError(e.message),
    );
    const b = watchSessions(user!.uid, setSessions, (e) => setError(e.message));
    return () => {
      a();
      b();
    };
  }, [instructor, user, isMonitor]);
  useEffect(() => {
    if (!sessionId || !user) return;
    return watchSession(
      sessionId,
      isMonitor,
      (data, live) => {
        setConnected(live);
        timing.current = { server: data.updatedAt, local: performance.now() };
        setNow(data.updatedAt);
        if (isMonitor) setMonitor(data as MonitorState);
        else setSession(data as Session);
      },
      (e) => {
        setConnected(false);
        setError(e.message);
      },
      setConnected,
    );
  }, [sessionId, user, isMonitor]);
  useEffect(() => {
    if (!sessionId || isMonitor || !instructor) return;
    let pending = false;
    const id = setInterval(() => {
      if (navigator.onLine && !pending) {
        pending = true;
        void call("command", {
          session: sessionId,
          command: { id: crypto.randomUUID(), type: "tick" },
        })
          .catch(() => setConnected(false))
          .finally(() => {
            pending = false;
          });
      }
    }, 5000);
    return () => clearInterval(id);
  }, [sessionId, isMonitor, instructor]);
  useEffect(() => {
    if (backendReady && isMonitor && code && !user && !loading)
      void signAnonymous().catch((e) => setError(e.message));
  }, [isMonitor, code, user, loading]);
  useEffect(() => {
    if (!backendReady || !isMonitor || !code || !user) return;
    void call<{ id: string }>("join", { code })
      .then((r) => setSessionId(r.id))
      .catch((e) => setError(e.message));
  }, [isMonitor, user]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const cmd = (type: string, data: Record<string, unknown> = {}) =>
    run(() =>
      call("command", {
        session: sessionId,
        command: { id: crypto.randomUUID(), type, ...data },
      }),
    );
  async function start(s: Scenario) {
    await run(async () => {
      const r = await call<{ id: string }>("create", { scenario: s.id });
      setSession(null);
      setShowQR(false);
      localStorage.setItem("cidsimroom-controller-session",r.id);
      history.replaceState(null,"","/controller");
      setSessionId(r.id);
      setView("controller");
      setTab("Actions");
    });
  }
  const openEditor = (s: Scenario) => {
    setSelected(s);
    setView("editor");
  };
  async function exportDebrief() {
    if (!session) return;
    let audit:unknown=null;
    if(provider==='supabase'){try{audit=await call('audit',{session:sessionId})}catch(e){setError('Export failed to retrieve the full backend audit: '+(e as Error).message);return;}}
    const text = JSON.stringify(
      {
        backendAudit:audit,
        scenario: session.scenario,
        events: session.events,
        interventions: session.interventions || {},
        engineVersion:session.engine?.version,
        patientState:session.engine?.patient,
        measurements:session.engine?.measurements,
        learnerRecords:session.engine?.learners,
        scheduler:session.engine?.scheduler,
        checkpoints:session.engine?.checkpoints,
        replayOrigin:session.engine?.origin,
        commands:session.engine?.commands,
        randomSeed:session.engine?.session.seed,
        finalBranch: session.branch || null,
        timeJumps: session.timeJumps || [],
        finalOxygen: session.oxygen,
        assistedVentilation: session.ventilation || { assisted: false, rate: null },
        outstandingObjectives: session.scenario.objectives.filter(o=>session.scenario.stages.flatMap(st=>st.actions).some(a=>a.objective===o.id&&session.actions[a.id]!=="yes")),
        outstanding: session.scenario.stages
          .flatMap((s) => s.actions)
          .filter((a) => session.actions[a.id] !== "yes"),
      },
      null,
      2,
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    a.download = `cidsimroom-${sessionId}-debrief.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  if (!backendReady)
    return (
      <div className="login-shell">
        <div className="login-story">
          <span className="brand">
            <Activity /> CIDSIMROOM
          </span>
          <h1>
            Practice that
            <br />
            prepares.
          </h1>
          <p>
            A shared room. A realistic patient.
            <br />
            Space to learn when it matters.
          </p>
          <small>CLINICAL SIMULATION · FACULTY WORKSPACE</small>
        </div>
        <div className="login-form">
          <ShieldCheck size={32} />
          <h2>Workspace setup in progress</h2>
          <p>
            Faculty sign-in and live simulation sessions will be available here
            once workspace setup is complete.
          </p>
        </div>
      </div>
    );
  if (isMonitor) {
    if (monitor)
      return (
        <>
          <Monitor s={monitor} session={sessionId} connected={connected} />
          {error && <div className="global-error">{error}</div>}
        </>
      );
    return (
      <div className="join-screen">
        <Activity size={40} />
        <h1>Join a patient monitor</h1>
        <p>Enter the code shown on the instructor’s controller.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (!currentUser()) await signAnonymous();
              const r = await call<{ id: string }>("join", { code });
              setSessionId(r.id);
            });
          }}
        >
          <label>
            Session code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="8-character code"
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            Connect monitor <ArrowUpRight size={18} />
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }
  if (loading)
    return <div className="join-screen">Connecting to CIDSIMROOM…</div>;
  if (!instructor)
    return (
      <div className="login-shell">
        <div className="login-story">
          <span className="brand">
            <Activity /> CIDSIMROOM
          </span>
          <h1>
            Practice that
            <br />
            prepares.
          </h1>
          <p>
            A shared room. A realistic patient.
            <br />
            Space to learn when it matters.
          </p>
          <div className="login-trace">⌁ ─────╱╲╱╲──────</div>
          <small>CLINICAL SIMULATION · FACULTY WORKSPACE</small>
        </div>
        <div className="login-form">
          <ShieldCheck size={32} />
          <h2>Welcome to CIDSIMROOM</h2>
          <p>Sign in to your faculty workspace.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => signIn(email, password));
            }}
          >
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              Sign in <ArrowUpRight size={18} />
            </button>
          </form>
          {provider === "supabase" && (
            <>
              <button
                type="button"
                disabled={busy || !email.trim() || password.length < 6}
                onClick={() =>
                  void run(async () => {
                    const confirmed = await registerFaculty(email, password);
                    setNotice(
                      confirmed
                        ? "Account created. Sign in to continue."
                        : "Check your email to confirm your account, then sign in.",
                    );
                  })
                }
              >
                Create faculty sign-in
              </button>
              <p className="help">
                Only approved, verified faculty accounts can access cases.
              </p>
              {notice && <p role="status">{notice}</p>}
            </>
          )}
          {user && (
            <p>
              Your account needs faculty access.{" "}
              <button onClick={() => void logOut()}>Sign out</button>
            </p>
          )}
          {emulator && (
            <p className="help">
              Emulator workspace · seed before signing in.
              <br />
              Demo password: SimRoom123!
            </p>
          )}
          <a href="/monitor">Open monitor display →</a>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  const stage = session?.scenario.stages[session.stage];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <Activity /> CIDSIMROOM
        </a>
        <span className="sidebar-caption">FACULTY WORKSPACE</span>
        <nav>
          <button
            className={view === "library" ? "active" : ""}
            onClick={() => setView("library")}
          >
            <BookOpen /> Scenario library
          </button>
          <button
            className={view === "controller" ? "active" : ""}
            onClick={() =>
              session ? setView("controller") : setView("library")
            }
          >
            <HeartPulse /> Live session {session && <i />}
          </button>
          <button
            className={view === "debriefs" ? "active" : ""}
            onClick={() => setView("debriefs")}
          >
            <ClipboardList /> Debriefs
          </button>
          <button
            className={view === "editor" ? "active" : ""}
            onClick={() => openEditor(selected || cases[0])}
            disabled={!cases.length}
          >
            <Edit3 /> Scenario editor
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">CT</span>
          <div>
            <strong>Clinical faculty</strong>
            <small>
              {emulator ? "Emulator workspace" : "Instructor workspace"}
            </small>
          </div>
          <button aria-label="Sign out" onClick={() => void logOut()}>
            ↗
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            {view === "library"
              ? "Scenario library"
              : view === "controller"
                ? "Live session"
                : view === "editor"
                  ? "Scenario editor"
                  : "Debriefs"}
          </span>
          <span className="top-status">
            <span className="dot" />{" "}
            {emulator ? "Development workspace" : "Faculty workspace"}
          </span>
        </header>
        {error && (
          <div className="error global-error" role="alert">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        {view === "library" && (
          <main className="library">
            <div className="eyebrow">TEACH. OBSERVE. REFLECT.</div>
            <div className="page-heading">
              <div>
                <h1>
                  Your next simulation
                  <br />
                  starts here.
                </h1>
                <p>
                  Choose a case, connect a monitor, and focus on the learners.
                </p>
              </div>
              <a className="outline" href="/monitor" target="_blank">
                <MonitorIcon size={18} /> Join a monitor{" "}
                <ArrowUpRight size={16} />
              </a>
            </div>
            <div className="workflow">
              <div className="workflow-icon">
                <Stethoscope />
              </div>
              <div>
                <strong>Built for the room you’re in.</strong>
                <p>
                  Control the patient from your phone. Keep the monitor on a
                  separate screen.
                </p>
              </div>
              <span className="tag">IN-PERSON SIMULATION</span>
            </div>
            <div className="section-heading">
              <h2>
                Scenario library <span>{cases.length} cases</span>
              </h2>
              <span>Faculty clinical simulations</span>
            </div>
            <div className="case-grid">
              {cases.map((s, i) => (
                <article className="case-card" key={s.id}>
                  <div className={`case-art art-${i}`}>
                    <div className="art-grid" />
                    <span className="case-number">CASE 0{i + 1}</span>
                    {i === 0 ? (
                      <HeartPulse size={80} strokeWidth={1} />
                    ) : i === 1 ? (
                      <Stethoscope size={80} strokeWidth={1} />
                    ) : (
                      <Activity size={80} strokeWidth={1} />
                    )}
                    <span className="art-category">
                      {s.id==='stemi'?'CARDIOLOGY':['ptx','pe'].includes(s.id)?'THORACIC MEDICINE':'CLINICAL SIMULATION'}
                    </span>
                  </div>
                  <div className="case-body">
                    <div className="case-meta">
                      <span>{s.stages.length} stages</span>
                      <span>
                        <Clock size={13} /> Faculty-paced + debrief
                      </span>
                    </div>
                    <h3>{s.title}</h3>
                    <p>{s.briefing}</p>
                    <div className="patient-line">
                      <span>{s.patient}</span>
                      <span>v{s.version}</span>
                    </div>
                    <button disabled={busy} onClick={()=>void run(async()=>{const r=await call<{id:string;code:string}>("create",{scenario:s.id});location.assign(`/monitor?code=${r.code}`)})}>Start on this monitor</button>
                    <div className="case-buttons">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => void start(s)}
                      >
                        <Play size={16} /> Start session
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Briefing ${s.title}`}
                        onClick={() => {
                          setSelected(s);
                          setView("briefing");
                        }}
                      >
                        <ChevronRight />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="library-footer">
              <ShieldCheck size={18} />
              <span>
                Private faculty content. Monitor displays receive observations
                and released investigations only.
              </span>
            </div>
            <div className="review-banner">
              <strong>Faculty review required</strong>
              <p>
                Review each case’s source qualifications, rhythms, timing,
                branch conditions and approved investigation assets before teaching.
              </p>
            </div>
          </main>
        )}
        {view === "briefing" && selected && (
          <main className="content-page">
            <button onClick={() => setView("library")}>← Library</button>
            <h1>{selected.title}</h1>
            <p className="lead">{selected.briefing}</p>
            <h2>Preparation</h2>
            <p>{selected.preparation}</p>
            <PackSections
              scenario={selected}
              sections={[
                "openingHandover",
                "equipment",
                "actorInstructions",
                "nurseInstructions",
                "references",
                "revisionNotes",
                "pilotChecklist",
              ]}
            />
            <h2>Learning objectives</h2>
            {selected.objectives.map((o) => (
              <p key={o.id}>• {o.text}</p>
            ))}
            <h2>Four-stage overview</h2>
            {selected.stages.map((s, i) => (
              <div className="panel" key={s.id}>
                <h3>
                  {i + 1}. {s.name}
                </h3>
                <p>
                  {Object.entries(s.observations)
                    .map(([k, v]) => `${k.toUpperCase()} ${v}`)
                    .join(" · ")}{" "}
                  · {s.oxygen}
                </p>
                <p>{s.findings}</p>
                <p className="help">Source transition: {s.sourceTrigger}</p>
              </div>
            ))}
            <h2>Content review</h2>
            {selected.review.map((x) => (
              <p key={x}>{x}</p>
            ))}
            <p>{selected.source}</p>
            <button className="primary" onClick={() => void start(selected)}>
              Start session
            </button>
            <button onClick={() => openEditor(selected)}>Edit scenario</button>
          </main>
        )}
        {view === "controller" && session && stage && (
          <main className="controller">
            <div className="session-heading">
              <div>
                <div className="eyebrow">
                  LIVE FACULTY CONTROLLER · V{session.scenario.version}
                </div>
                <h1>{session.scenario.title}</h1>
                <p>{session.scenario.patient}</p>
              </div>
              <button onClick={() => setShowQR(!showQR)}>
                <MonitorIcon size={18} /> Connect monitor
              </button>
            </div>
            {showQR && (
              <div className="panel qr-panel">
                <QRCodeSVG
                  value={`${location.origin}/monitor?code=${session.code}`}
                  size={150}
                />
                <div>
                  <strong className="session-code">{session.code}</strong>
                  <p>Scan or enter this code on the monitor.</p>
                  <a
                    href={`/monitor?code=${session.code}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open monitor ↗
                  </a>
                </div>
              </div>
            )}
            <div className="stage-status">
              <span>
                <span className={connected ? "dot" : "dot red"} />{" "}
                {connected
                  ? "Connected"
                  : "Disconnected · controls unavailable"}
              </span>
              <strong>
                {clock(
                  session.elapsed +
                    (session.status === "running"
                      ? Math.max(0, (connected?now:session.updatedAt) - session.anchor)
                      : 0),
                )}
              </strong>
              <span>{session.status.toUpperCase()}</span>
            </div>
            <div className="stage-strip">
              {session.scenario.stages.map((s, i) => (
                <span
                  key={s.id}
                  className={i === session.stage ? "current" : ""}
                >
                  {i + 1}
                  <small>{s.name}</small>
                </span>
              ))}
            </div>
            <PatientNow session={session} now={connected?now:session.updatedAt} stale={!connected}/>
            <Progression session={session}/>
            <div className="controller-tabs">
              {["Actions", "Patient", "Control"].map((t) => (
                <button
                  className={tab === t ? "active" : ""}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <nav className="faculty-sections" aria-label="Faculty sections">
              {[
                "Briefing",
                "History",
                "Findings",
                "Investigations",
                "Checklist",
                "Debrief",
              ].map((section) => (
                <button
                  key={section}
                  aria-pressed={
                    section === "Checklist"
                      ? tab === "Actions"
                      : tab === "Patient" && patientSection === section
                  }
                  onClick={() => {
                    if (section === "Debrief") setView("debrief");
                    else if (section === "Checklist") setTab("Actions");
                    else {
                      setTab("Patient");
                      setPatientSection(section);
                    }
                  }}
                >
                  {section}
                </button>
              ))}
            </nav>
            <fieldset
              disabled={busy || !connected}
              className="controller-fieldset"
            >
              {tab === "Actions" && (
                <>
                  <div className="section-heading">
                    <h2>Stage {session.stage + 1} · Learner actions</h2>
                    <span>
                      {
                        stage.actions.filter(
                          (a) => session.actions[a.id] === "yes",
                        ).length
                      }
                      /{stage.actions.length} recorded
                    </span>
                  </div>
                  <p className="help">
                    Record what learners do. Actions can be completed in any
                    order.
                  </p>
                  {session.scenario.stages
                    .flatMap((st, i) => st.actions.map((a) => ({ a, i })))
                    .filter(
                      ({ a, i }) =>
                        i === session.stage || session.actions[a.id] !== "yes",
                    )
                    .sort(
                      (a, b) =>
                        (a.i === session.stage
                          ? -1
                          : a.i < session.stage
                            ? 0
                            : 1) -
                        (b.i === session.stage
                          ? -1
                          : b.i < session.stage
                            ? 0
                            : 1),
                    )
                    .map(({ a, i }) => (
                      <div
                        className={`action-card ${session.actions[a.id] === "yes" ? "completed" : ""}`}
                        key={a.id}
                      >
                        <div className="action-label">
                          <span className="eyebrow">
                            {i === session.stage
                              ? "CURRENT STAGE"
                              : i < session.stage
                                ? "EARLIER · OUTSTANDING"
                                : "AVAILABLE EARLY"}{" "}
                            · {a.objective}
                          </span>
                          <h3>{a.text}</h3>
                          <p>{session.engine?.learners.records[a.id]?.completedAt!=null?`Recorded ${clock(session.engine.learners.records[a.id].completedAt!)} · ${session.engine.learners.records[a.id].independent?'independent':'prompted'}`:'Outstanding'} · {a.response?.reviewed?'Reviewed response configured':session.scenario.schedulerRules?.some(r=>r.trigger.kind==='action'&&r.trigger.id===a.id)?'Configured scheduler rule; delivery/effectiveness conditions still apply':'Records action only'}</p>
                        </div>
                        <div className="action-buttons">
                          <button
                            className="yes"
                            onClick={() =>
                              void cmd("action", {
                                action: a.id,
                                answer: "yes",
                              })
                            }
                          >
                            <Check size={17} />{" "}
                            {session.actions[a.id] === "yes"
                              ? "Recorded"
                              : "Yes"}
                          </button>
                          <button
                            className={
                              session.actions[a.id] === "notyet"
                                ? "selected"
                                : ""
                            }
                            onClick={() =>
                              void cmd("action", {
                                action: a.id,
                                answer: "notyet",
                              })
                            }
                          >
                            Not yet
                          </button>
                          <button
                            className="prompt"
                            onClick={() => void cmd("prompt", { action: a.id })}
                          >
                            Prompt given
                          </button>
                        </div>
                      </div>
                    ))}
                  <InterventionControls session={session} command={cmd} />
                  <form
                    className="note-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void cmd("note", { text: note }).then(() => setNote(""));
                    }}
                  >
                    <label>
                      Faculty note
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={2000}
                        placeholder="Capture clinical reasoning or teaching context…"
                      />
                    </label>
                    <button disabled={!note.trim()}>
                      <Plus size={16} /> Add timestamped note
                    </button>
                  </form>
                </>
              )}
              {tab === "Patient" && (
                <>
                  {patientSection === "Briefing" && (
                    <>
                      <section className="panel">
                        <h2>Patient briefing</h2>
                        <pre className="source-text">
                          {session.scenario.briefing}
                        </pre>
                        <h3>Preparation</h3>
                        <pre className="source-text">
                          {session.scenario.preparation}
                        </pre>
                        <h3>Learning objectives</h3>
                        {session.scenario.objectives.map((o) => (
                          <p key={o.id}>{o.text}</p>
                        ))}
                      </section>
                      <PackSections
                        scenario={session.scenario}
                        sections={[
                          "openingHandover",
                          "equipment",
                          "actorInstructions",
                          "nurseInstructions",
                          "references",
                          "revisionNotes",
                          "pilotChecklist",
                        ]}
                      />
                    </>
                  )}
                  {patientSection === "History" && (
                    <>
                      <div className="panel">
                        <span className="eyebrow">
                          PRIVATE · SUPPLY ONLY WHEN ASKED
                        </span>
                        <h2>Patient history</h2>
                        <pre className="source-text">
                          {session.scenario.history}
                        </pre>
                      </div>
                      <PackSections
                        scenario={session.scenario}
                        sections={[
                          "historyAnswers",
                          "actorInstructions",
                          "nurseInstructions",
                        ]}
                      />
                    </>
                  )}
                  {patientSection === "Findings" && (
                    <>
                      <div className="panel">
                        <h2>Examination</h2>
                        <pre className="source-text">
                          {session.scenario.branches?.find(
                            (b) => b.id === session.branch,
                          )?.findings ?? stage.findings}
                        </pre>
                      </div>
                      <div className="panel">
                        <h2>Leader, nurse and actor cues</h2>
                        <pre className="source-text">
                          {session.scenario.branches?.find(
                            (b) => b.id === session.branch,
                          )?.cues ?? stage.cues}
                        </pre>
                        <button
                          onClick={() =>
                            void cmd("cue", {
                              text:
                                session.scenario.branches?.find(
                                  (b) => b.id === session.branch,
                                )?.cues ?? stage.cues,
                            })
                          }
                        >
                          Record cue given
                        </button>
                      </div>
                    </>
                  )}
                  {patientSection === "Investigations" && (
                    <>
                      <InvestigationInstances session={session} command={cmd}/>
                      <details><summary>Legacy investigation controls and asset preview</summary>
                      <h2>Investigations</h2>
                      <p className="help">
                        Request, release and interpretation are distinct. Early
                        requests are always available.
                      </p>
                      {session.scenario.investigations.map((i) => (
                        <div className="panel" key={i.id}>
                          <h3>{i.name}</h3>
                          <p>
                            {i.report
                              ? "Supplied synthetic text report"
                              : i.assetPath
                                ? "Faculty asset attached"
                                : "Awaiting faculty-supplied asset · no result invented"}
                          </p>
                          <div className="button-row">
                            {["requested", "released", "interpreted"].map(
                              (state) => (
                                <button
                                  key={state}
                                  disabled={
                                    state === "released" &&
                                    !i.assetPath &&
                                    !i.report
                                  }
                                  className={
                                    session.investigations[i.id]?.[state]
                                      ? "selected"
                                      : ""
                                  }
                                  onClick={() => {
                                    if (
                                      state === "released" &&
                                      i.requireConfirmation &&
                                      !confirm(
                                        "Confirm the pack release conditions are met.",
                                      )
                                    )
                                      return;
                                    void cmd("investigation", {
                                      investigation: i.id,
                                      state,
                                      confirmed:
                                        state === "released" &&
                                        i.requireConfirmation,
                                    });
                                  }}
                                >
                                  {session.investigations[i.id]?.[state]
                                    ? "✓ "
                                    : ""}
                                  {state}
                                </button>
                              ),
                            )}
                          </div>
                          {i.report && (
                            <details>
                              <summary>Private faculty report preview</summary>
                              <pre className="source-text">{i.report}</pre>
                            </details>
                          )}
                          {i.facultyNote && (
                            <pre className="source-text">{i.facultyNote}</pre>
                          )}
                          {(i.assetPath || i.report) && (
                            <button
                              onClick={() =>
                                void run(async () => {
                                  const a = await call<{
                                    data: string;
                                    mime: string;
                                  }>("asset", {
                                    session: sessionId,
                                    investigation: i.id,
                                  });
                                  const url = URL.createObjectURL(
                                    new Blob(
                                      [
                                        Uint8Array.from(atob(a.data), (c) =>
                                          c.charCodeAt(0),
                                        ),
                                      ],
                                      { type: a.mime },
                                    ),
                                  );
                                  window.open(url);
                                  setTimeout(
                                    () => URL.revokeObjectURL(url),
                                    60000,
                                  );
                                })
                              }
                            >
                              View private asset
                            </button>
                          )}
                        </div>
                      ))}
                      <p className="help">
                        Assets attach through the scenario editor. This live
                        session retains its starting version.
                      </p>
                      </details>
                    </>
                  )}
                </>
              )}
              {tab === "Control" && (
                <>
                  <h2>Session controls</h2>
                  <div className="button-row">
                    {session.status === "ready" && (
                      <button
                        className="primary"
                        onClick={() => void cmd("start")}
                      >
                        Start
                      </button>
                    )}
                    {session.status === "running" && (
                      <button onClick={() => void cmd("pause")}>Pause</button>
                    )}
                    {session.status === "paused" && (
                      <button
                        className="primary"
                        onClick={() => void cmd("resume")}
                      >
                        Resume
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            "Reset observations and action statuses? The audit timeline is retained.",
                          )
                        )
                          void cmd("reset");
                      }}
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("End this session?")) void cmd("end");
                      }}
                    >
                      End session
                    </button>
                    <button onClick={() => setView("debrief")}>
                      View debrief
                    </button>
                  </div>
                  <div className="panel">
                    <h2>Stage playback</h2>
                    <label>
                      Change duration in seconds (faculty setting)
                      <input
                        type="number"
                        min="0"
                        max="3600"
                        value={duration}
                        onChange={(e) =>
                          setDuration(
                            Math.max(0, Math.min(3600, Number(e.target.value))),
                          )
                        }
                      />
                    </label>
                    <div className="stage-buttons">
                      {session.scenario.stages.map((s, i) => (
                        <button
                          className={i === session.stage ? "selected" : ""}
                          key={s.id}
                          onClick={() =>
                            void cmd("stage", {
                              stage: i,
                              duration: duration * 1000,
                            })
                          }
                        >
                          {i + 1}. {s.name}
                        </button>
                      ))}
                    </div>
                    <label>
                      Playback mode
                      <select
                        value={session.mode}
                        onChange={(e) =>
                          void cmd("mode", { value: e.target.value })
                        }
                      >
                        <option value="manual">Manual</option>
                        <option value="guided">
                          Guided · reviewed rules only
                        </option>
                      </select>
                    </label>
                    <p className="help">
                      {stage.transition
                        ? "Reviewed transition configured"
                        : "Transition unset · manual faculty advancement required"}
                    </p>
                    <p className="help">Source cue: {stage.sourceTrigger}</p>
                    {stage.teachingWindow&&<p className="help">Suggested teaching window: {stage.teachingWindow}. This is not a compulsory clinical delay.</p>}
                    {stage.transition?.requireConfirmation && (
                      <button onClick={() => void cmd("confirm")}>
                        Confirm transition
                      </button>
                    )}
                  </div>
                  <BranchControls session={session} command={cmd} />
                  <section className="panel"><h2>Perfusion and signal quality</h2><label>Perfusion<select aria-label="Perfusion" value={session.perfusion||"normal"} onChange={e=>void cmd("signal",{perfusion:e.target.value,quality:session.signalQuality||"clean"})}><option value="normal">Normal</option><option value="poor">Poor perfusion · reduced pleth</option><option value="absent">Absent perfusing pulse</option></select></label><label>Signal quality<select aria-label="Signal quality" value={session.signalQuality||"clean"} onChange={e=>void cmd("signal",{perfusion:session.perfusion||"normal",quality:e.target.value})}><option value="clean">Clean</option><option value="artefact">Artefact</option></select></label><button onClick={()=>void cmd("signalScenario")}>Return signal to scenario control</button><p>Perfusion is independent of SpO₂. VF and asystole have no perfusing pleth or pulse beep.</p></section>
                  <EngineControls session={session} sessionId={sessionId} now={connected?now:session.updatedAt} command={cmd}/>
                  <h2>Manual observations</h2>
                  <p className="help">
                    An override stays pinned through stage changes until
                    returned to scenario control.
                  </p>
                  <div className="override-grid">
                    {Object.entries(session.observations).map(([k, v]) => (
                      <form
                        className="panel"
                        key={k}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const value = Number(
                            new FormData(e.currentTarget).get("value"),
                          );
                          void cmd("override", { field: k, value });
                        }}
                      >
                        <label>
                          {k.toUpperCase()}{" "}
                          {session.pins[k as keyof Obs] && (
                            <span className="tag">PINNED</span>
                          )}
                          <input
                            name="value"
                            type="number"
                            step={k === "temp" ? "0.1" : "1"}
                            min="0"
                            max="400"
                            defaultValue={v}
                            key={`${session.stage}-${v}`}
                          />
                        </label>
                        <button>Apply & pin</button>
                        {session.pins[k as keyof Obs] && (
                          <button
                            type="button"
                            onClick={() => void cmd("unpin", { field: k })}
                          >
                            Return to scenario
                          </button>
                        )}
                      </form>
                    ))}
                  </div>
                  <form
                    className="panel"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      const device = String(data.get("device") || "").trim();
                      const flow = data.get("flow") === "" ? null : Number(data.get("flow"));
                      void cmd("oxygen", {
                        value: device && flow !== null ? `${device} at ${flow} L/min` : String(data.get("oxygen")),
                        device,
                        flow,
                      });
                    }}
                  >
                    <label>
                      Oxygen delivery · independent of SpO₂
                      <input
                        name="oxygen"
                        defaultValue={session.oxygen}
                        key={session.oxygen}
                        maxLength={120}
                      />
                    </label>
                    <label>
                      Device
                      <input
                        name="device"
                        defaultValue={session.oxygenDevice || session.oxygen}
                        maxLength={120}
                      />
                    </label>
                    <label>
                      Flow (L/min; leave blank if unspecified)
                      <input
                        name="flow"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        defaultValue={session.oxygenFlow ?? ""}
                      />
                    </label>
                    <button>Apply & pin delivery</button>
                    <button
                      type="button"
                      onClick={() => void cmd("oxygenScenario")}
                    >
                      Return to scenario oxygen
                    </button>
                  </form>
                  <form
                    className="panel"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      void cmd("ventilation", {
                        assisted: d.get("assisted") === "on",
                        rate:
                          d.get("rate") === "" ? null : Number(d.get("rate")),
                      });
                    }}
                  >
                    <h2>Assisted ventilation</h2>
                    <p className="help">
                      Recorded separately; spontaneous respiratory rate is
                      unchanged.
                    </p>
                    <label>
                      <input
                        name="assisted"
                        type="checkbox"
                        defaultChecked={session.ventilation?.assisted}
                      />{" "}
                      Assisted ventilation in progress
                    </label>
                    <label>
                      Assisted rate (/min; leave blank if unspecified)
                      <input
                        name="rate"
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={session.ventilation?.rate ?? ""}
                      />
                    </label>
                    <button>Record ventilation</button>
                  </form>
                  <div className="panel">
                    <label>
                      Monitor rhythm
                      <select
                        value={session.rhythm || ""}
                        onChange={(e) =>
                          void cmd("rhythm", { value: e.target.value || null })
                        }
                      >
                        <option value="">Unset · no ECG waveform</option>
                        <option value="sinus">Sinus · faculty selected</option>
                        <option value="vf">VF · faculty selected</option>
                        <option value="asystole">
                          Asystole · faculty selected
                        </option>
                      </select>
                    </label>
                    <button onClick={() => void cmd("rhythmScenario")}>
                      Return rhythm to scenario control
                    </button>
                    <button onClick={() => void cmd("alarm")}>
                      Acknowledge observation alarm
                    </button>
                  </div>
                </>
              )}
            </fieldset>
          </main>
        )}
        {(view === "debrief" || view === "debriefs") && (
          <main className="content-page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">REFLECT & REVIEW</div>
                <h1>
                  {view === "debrief" ? "Session debrief" : "Previous sessions"}
                </h1>
              </div>
              {view === "debrief" && (
                <button className="primary" onClick={exportDebrief}>
                  Export debrief JSON
                </button>
              )}
            </div>
            {view === "debriefs"
              ? sessions.map((s, i) => (
                  <button
                    className="session-row"
                    key={i}
                    onClick={() => {
                      setSessionId((s as unknown as { _id: string })._id);
                      setView("debrief");
                    }}
                  >
                    <span>
                      {s.scenario.title} · v{s.scenario.version}
                    </span>
                    <span>
                      {s.status} · {s.events.length} events →
                    </span>
                  </button>
                ))
              : session && (
                  <>
                    <p>
                      {session.scenario.title} · {session.status} ·{" "}
                      {session.events.filter((e) => e.type === "prompt").length}{" "}
                      faculty prompts
                    </p>
                    <h2>Learning objectives</h2>
                    <p className="help">
                      Formative teaching checklist. No automatic pass mark; not
                      a validated examination.
                    </p>
                    {session.scenario.objectives.map((o) => (
                      <div className="panel" key={o.id}>
                        <strong>{o.text}</strong>
                        {session.scenario.stages
                          .flatMap((s) => s.actions)
                          .filter((a) => a.objective === o.id)
                          .map((a) => (
                            <p key={a.id}>
                              {session.actions[a.id] === "yes"
                                ? "✓ Recorded"
                                : "○ Outstanding"}{" "}
                              · {a.text}
                            </p>
                          ))}
                      </div>
                    ))}
                    <PackSections
                      scenario={session.scenario}
                      sections={[
                        "debriefQuestions",
                        "teachingPoints",
                        "exampleSBAR",
                        "references",
                        "revisionNotes",
                        "pilotChecklist",
                      ]}
                    />
                    {!!session.scenario.interventions?.length && (
                      <>
                        <h2>Delivered interventions</h2>
                        {session.scenario.interventions.map((i) => (
                          <p key={i.id}>
                            {i.name} ·{" "}
                            {Object.entries(session.interventions?.[i.id] || {})
                              .filter(([, v]) => v)
                              .map(([k]) => k)
                              .join(", ") || "Outstanding"}
                          </p>
                        ))}
                      </>
                    )}
                    {provider==='supabase'&&<BackendAudit sessionId={sessionId}/>}<ReplaySandbox session={session}/>
                    <h2>Independent and prompted actions</h2>
                    {Object.entries(session.engine?.learners.records||{}).filter(([,r])=>r.everCompleted).map(([id,r])=><p key={id}>{session.scenario.stages.flatMap(st=>st.actions).find(a=>a.id===id)?.text} · {r.independent?"independent":"prompted"} · {r.completedAt!=null?clock(r.completedAt):"earlier record"}</p>)}
                    <h2>Event timeline</h2>
                    {timeline(session.events).map((e) => (
                      <div className="timeline-row" key={e.id}>
                        <time>{clock(e.at)}</time>
                        <div>
                          <span className="eyebrow">
                            {e.type} · STAGE {e.stage + 1}{" "}
                            {e.answer && `· ${e.answer}`}
                          </span>
                          <p>{e.label}</p>
                          {e.observations && (
                            <small>
                              {Object.entries(e.observations)
                                .map(([k, v]) => `${k} ${v}`)
                                .join(" · ")}
                            </small>
                          )}
                          {e.oxygen && <small> · O₂: {e.oxygen}</small>}
                          {e.branch && <small> · Branch: {e.branch}</small>}
                        </div>
                      </div>
                    ))}
                  </>
                )}
          </main>
        )}
        {location.pathname==="/controller" && <section className="panel"><p role="status">{pairMessage}</p>{!sessionId && <form onSubmit={e=>{e.preventDefault();void redeemPair()}}><label>Phone pairing code<input value={pairCode} onChange={e=>setPairCode(e.target.value.toUpperCase())}/></label><button>Connect to monitor</button></form>}{sessionId && <Pairing session={sessionId} connected={connected} controller onEnd={()=>{if(confirm("End this simulation?"))void cmd("end")}}/>}</section>}
        {view === "editor" && selected && <ScenarioEditor key={selected.id} scenario={selected} onSaved={()=>setNotice("Saved new version; live session unchanged")}/>}

      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  void navigator.serviceWorker.register("/sw.js");
