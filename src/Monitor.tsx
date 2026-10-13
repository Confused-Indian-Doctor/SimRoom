import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX, Maximize, Activity } from "lucide-react";
import type { MonitorState, Obs } from "./types";
import { call } from "./backend";
import { SignalClock } from "./signals.js";
import { SignalCanvas } from "./SignalCanvas";
import { Pairing } from "./Pairing";
export function clock(ms: number) {
  return `${Math.floor(ms / 60000)
    .toString()
    .padStart(
      2,
      "0",
    )}:${Math.floor(ms / 1000) % 60 < 10 ? "0" : ""}${Math.floor(ms / 1000) % 60}`;
}
export function liveValues(s: MonitorState, now: number): Obs {
  if (!s.ramp) return s.observations;
  const time =
      s.elapsed + (s.status === "running" ? Math.max(0, now - s.anchor) : 0),
    p = Math.min(1, Math.max(0, (time - s.ramp.at) / s.ramp.duration));
  return Object.fromEntries(
    Object.entries(s.observations).map(([k, v]) => [
      k,
      s.pins[k as keyof Obs]
        ? v
        : +(
            s.ramp!.from[k as keyof Obs] +
            (s.ramp!.to[k as keyof Obs] - s.ramp!.from[k as keyof Obs]) * p
          ).toFixed(1),
    ]),
  ) as Obs;
}
export function Monitor({
  s,
  connected,
  session,
  ack,
}: {
  s: MonitorState;
  connected: boolean;
  session: string;
  ack?: () => void;
}) {
  const timing = useMemo(
    () => ({ server: s.updatedAt, local: performance.now() }),
    [s.updatedAt],
  );
  const [now, setNow] = useState(s.updatedAt),
    [sound, setSound] = useState(false),
    [awake, setAwake] = useState(false),
    [localAck, setLocalAck] = useState(false),
    [err, setErr] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const signalClock=useRef(new SignalClock());
  const reference=useMemo(()=>({time:(s.elapsed+(s.status==="running"?Math.max(0,s.updatedAt-s.anchor):0))/1000,local:performance.now()}),[s.elapsed,s.anchor,s.updatedAt,s.status]);
  useEffect(() => {
    const i = setInterval(
      () => setNow(timing.server + performance.now() - timing.local),
      250,
    );
    return () => clearInterval(i);
  }, [timing]);
  const stale = !connected || now - s.updatedAt > 15000;
  const o = liveValues(s, stale ? s.updatedAt : now);
  const alarming = o.spo2 < 90 || o.sbp < 90 || o.hr > 130;
  useEffect(() => {
    if (!alarming) setLocalAck(false);
  }, [alarming]);
  const beep=()=>{if(!sound || stale || document.visibilityState!=="visible")return;const a=audio.current;if(!a)return;const osc=a.createOscillator(),g=a.createGain();osc.frequency.value=alarming&&!s.alarmAck&&!localAck?880:650;g.gain.value=.06;osc.connect(g);g.connect(a.destination);osc.start();osc.stop(a.currentTime+.06)};
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    const get = async () => {
      if (awake && document.visibilityState === "visible") {
        try {
          lock = await navigator.wakeLock.request("screen");
        } catch {
          setErr("Screen-awake unavailable; check device settings");
        }
      }
    };
    if (awake && "wakeLock" in navigator) void get();
    else if (awake) setErr("Screen-awake unsupported");
    document.addEventListener("visibilitychange", get);
    return () => {
      void lock?.release();
      document.removeEventListener("visibilitychange", get);
    };
  }, [awake]);
  const show = async (id: string) => {
    try {
      const r = await call<{ data: string; mime: string }>("asset", {
        session,
        investigation: id,
      });
      const b = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([b], { type: r.mime }));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setErr(String(e));
    }
  };
  return (
    <main className="monitor">
      <header>
        <span className="monitor-brand">
          <Activity size={22} /> CIDSIMROOM <small>PATIENT MONITOR</small>
        </span>
        <span className={stale ? "status bad" : "status"}>
          {stale
            ? "● CONNECTION LOST · OBSERVATIONS STALE"
            : "● LIVE CONNECTION"}
        </span>
      </header>
      <div className="monitor-patient">
        <span>{s.patient}</span>
        <span>
          {s.status.toUpperCase()} ·{" "}
          {clock(
            s.elapsed +
              (s.status === "running" && !stale
                ? Math.max(0, now - s.anchor)
                : 0),
          )}
        </span>
      </div>
      {stale && (
        <div className="stale">
          Last received observations ·{" "}
          {new Date(s.updatedAt).toLocaleTimeString()} · Playback held
        </div>
      )}
      <div className="trace-grid">
        <section className="trace">
          <div className="trace-label green">
            ECG{" "}
            <span>
              {s.rhythm
                ? s.rhythm.toUpperCase()
                : "RHYTHM UNSET · NO DIAGNOSTIC TRACE"}
            </span>
          </div>
          <SignalCanvas reference={reference} clock={signalClock.current} perfusion={s.perfusion || "normal"} quality={s.signalQuality || "clean"}
            rate={o.hr}
            rhythm={s.rhythm}
            onPulse={beep}
            active={!stale && s.status === "running"}
          />
        </section>
        <section className="numeric green">
          <label>
            HR <small>bpm</small>
          </label>
          <strong>{s.rhythm==="vf"?"—":s.rhythm==="asystole"?"0":Math.round(o.hr)}</strong>
        </section>
        <section className="trace">
          <div className="trace-label cyan">
            PLETH <span>SpO₂</span>
          </div>
          <SignalCanvas reference={reference} clock={signalClock.current} perfusion={s.perfusion || "normal"} quality={s.signalQuality || "clean"}
            rate={o.hr}
            rhythm={s.rhythm}
            pleth
            active={!stale && s.status === "running"}
          />
        </section>
        <section className="numeric cyan">
          <label>
            SpO₂ <small>%</small>
          </label>
          <strong>{Math.round(o.spo2)}</strong>
        </section>
      </div>
      <div className="lower-vitals">
        <section className="numeric">
          <label>
            NIBP <small>mmHg</small>
          </label>
          <strong>
            {Math.round(o.sbp)}
            <span>/</span>
            {Math.round(o.dbp)}
          </strong>
          <small>MAP {Math.round((o.sbp + 2 * o.dbp) / 3)}</small>
        </section>
        <section className="numeric yellow">
          <label>
            {s.ventilation?.assisted ? "SPONT RR" : "RESP"} <small>/min</small>
          </label>
          <strong>{Math.round(o.rr)}</strong>
        </section>
        <section className="numeric purple">
          <label>
            TEMP <small>°C</small>
          </label>
          <strong>{o.temp.toFixed(1)}</strong>
        </section>
      </div>
      <div className="monitor-footer">
        <span>O₂ delivery · {s.oxygen}</span>
        {s.ventilation?.assisted && (
          <span>
            Assisted ventilation
            {s.ventilation.rate == null ? "" : ` · ${s.ventilation.rate}/min`}
          </span>
        )}
        <span>
          {alarming
            ? s.alarmAck || localAck
              ? "Alarm acknowledged"
              : "⚠ Observation alarm"
            : "Observations displayed"}
        </span>
      </div>
      <Pairing session={session} connected={connected}/>
      <div className="monitor-tools">
        <button
          onClick={() => {
            audio.current ||= new AudioContext();
            void audio.current.resume();
            setSound(!sound);
          }}
        >
          {sound ? <Volume2 /> : <VolumeX />} Sound {sound ? "on" : "off"}
        </button>
        <button onClick={() => setAwake(!awake)}>
          Screen awake {awake ? "on" : "off"}
        </button>
        <button
          onClick={() => void document.documentElement.requestFullscreen?.()}
        >
          <Maximize /> Full screen
        </button>
        {
          <button
            onClick={() => {
              setLocalAck(true);
              ack?.();
            }}
          >
            Acknowledge alarm
          </button>
        }
        {s.released.map((i) => (
          <button key={i.id} onClick={() => void show(i.id)}>
            {i.name}
          </button>
        ))}
      </div>
      {err && <p role="alert">{err}</p>}
      <p className="monitor-disclaimer">SIMULATED SIGNALS · EDUCATIONAL USE · SINGLE-LEAD RHYTHM DOES NOT EXCLUDE STEMI</p>
    </main>
  );
}
