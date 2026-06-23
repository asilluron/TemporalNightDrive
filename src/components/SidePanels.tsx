"use client";

import { useState } from "react";
import { fireRecall, setMailBroken } from "@/lib/api";

// A recall is a population action: one Visibility query finds every living
// matching car and fans a signal out to each. Nobody kept a list.
export function RecallPanel({ onDone }: { onDone: () => void }) {
  const [make, setMake] = useState("DeLorean");
  const [model, setModel] = useState("DMC-12");
  const [reason, setReason] = useState("Flux capacitor fire risk");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fire = async () => {
    setBusy(true);
    setResult(null);
    const res = await fireRecall(make, model, undefined, reason);
    setResult(res.error ? `! ${res.error}` : `Recalled ${res.recalled} car(s)`);
    setBusy(false);
    onDone();
  };

  return (
    <div className="panel">
      <h3 className="panel-title">RECALL FAN-OUT</h3>
      <input className="field" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Make" />
      <input className="field" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" />
      <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
      <button className="btn danger sm" disabled={busy} onClick={fire}>
        {busy ? "Signalling…" : "Issue Recall"}
      </button>
      {result && <p className="panel-result">{result}</p>}
    </div>
  );
}

// The resilience beat: while mail is "broken" the sendRecallNotice activity
// fails and the audience watches Temporal retry it — then heal it and watch it
// succeed with no lost work.
export function ChaosPanel({ broken, onToggle }: { broken: boolean; onToggle: (b: boolean) => void }) {
  const flip = async () => {
    const next = await setMailBroken(!broken);
    onToggle(next);
  };

  return (
    <div className="panel">
      <h3 className="panel-title">CHAOS · MAIL SERVICE</h3>
      <p className="panel-note">
        Recall notices retry automatically while the mail service is down.
      </p>
      <button className={`btn sm ${broken ? "danger" : "cyan"}`} onClick={flip}>
        {broken ? "● MAIL DOWN — Heal" : "○ MAIL UP — Break"}
      </button>
    </div>
  );
}
