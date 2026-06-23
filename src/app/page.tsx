"use client";

import { useCallback, useEffect, useState } from "react";
import type { LoanState } from "@/temporal/types";
import {
  fetchLot,
  fetchLoan,
  manufacture,
  sendSignal,
  requestSale,
  makeLoanPayment,
  getMailBroken,
  type LotResponse,
} from "@/lib/api";
import { LotGrid } from "@/components/LotGrid";
import { Inspector } from "@/components/Inspector";
import { RecallPanel, ChaosPanel } from "@/components/SidePanels";

const BUYERS = ["Marty McFly", "Kavinsky", "The Midnight", "Doc Brown"];

export default function Home() {
  const [lot, setLot] = useState<LotResponse>({ vehicles: [], stats: null });
  const [selectedVin, setSelectedVin] = useState<string | null>(null);
  const [loan, setLoan] = useState<LoanState | null>(null);
  const [mailBroken, setMailBroken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);

  const refreshLot = useCallback(async () => {
    try {
      setLot(await fetchLot());
    } catch {
      /* worker / server may be restarting — keep the last frame */
    }
  }, []);

  // Poll the population (Visibility query) on a real timer.
  useEffect(() => {
    void refreshLot();
    const id = setInterval(refreshLot, 1500);
    return () => clearInterval(id);
  }, [refreshLot]);

  useEffect(() => {
    void getMailBroken().then(setMailBroken).catch(() => undefined);
  }, []);

  const selected = lot.vehicles.find((v) => v.vin === selectedVin) ?? null;

  // Pull the child loan entity's live state while a financed car is selected.
  useEffect(() => {
    if (!selected?.financeWorkflowId) {
      setLoan(null);
      return;
    }
    let active = true;
    const tick = () =>
      fetchLoan(selected.vin)
        .then((l) => active && setLoan(l))
        .catch(() => undefined);
    void tick();
    const id = setInterval(tick, 1500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [selected?.vin, selected?.financeWorkflowId]);

  const onManufacture = async () => {
    setBusy(true);
    try {
      const { vin } = await manufacture();
      if (vin) setSelectedVin(vin);
      await refreshLot();
    } finally {
      setBusy(false);
    }
  };

  const onSignal = async (signal: string, args: unknown[]) => {
    if (!selected) return;
    setBusy(true);
    setSaleError(null);
    try {
      await sendSignal(selected.vin, signal, args);
      await refreshLot();
    } finally {
      setBusy(false);
    }
  };

  const onSell = async () => {
    if (!selected) return;
    setBusy(true);
    setSaleError(null);
    const price = selected.price ?? 20000;
    const res = await requestSale(selected.vin, {
      buyer: BUYERS[Math.floor(Math.random() * BUYERS.length)],
      salePrice: price,
      financed: true,
    });
    if (res.error) setSaleError(res.error);
    await refreshLot();
    setBusy(false);
  };

  const onPayLoan = async () => {
    if (!selected || !loan) return;
    setBusy(true);
    try {
      await makeLoanPayment(selected.vin, loan.monthlyPayment);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="stage">
      <div className="crt-bezel">
        <div className="crt-screen">
          <div className="screen-content">
            <div className="status-bar">
              <span>TEMPORAL://default · queue=living-lot</span>
              <span className="blink">{lot.vehicles.length ? "● LIVE" : "○ IDLE"}</span>
            </div>

            <h1 className="title">THE LIVING LOT</h1>
            <DemoClock lot={lot} />

            <div className="controls">
              <button className="btn" onClick={onManufacture} disabled={busy}>
                {busy ? "Working…" : "Manufacture Vehicle"}
              </button>
            </div>

            <div className="dashboard">
              <section className="lot-col">
                <h3 className="panel-title">THE LOT · {lot.vehicles.length} ENTITIES</h3>
                <LotGrid
                  vehicles={lot.vehicles}
                  selectedVin={selectedVin}
                  onSelect={setSelectedVin}
                />
              </section>

              <section className="inspect-col">
                <Inspector
                  vehicle={selected}
                  loan={loan}
                  busy={busy}
                  saleError={saleError}
                  onSignal={onSignal}
                  onSell={onSell}
                  onPayLoan={onPayLoan}
                />
                <RecallPanel onDone={refreshLot} />
                <ChaosPanel broken={mailBroken} onToggle={setMailBroken} />
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function DemoClock({ lot }: { lot: LotResponse }) {
  const s = lot.stats;
  return (
    <p className="subtitle">
      {s
        ? `1s = ${s.timeScale.toLocaleString()}s SIMULATED · ${s.living} LIVING · ~${s.simulatedYears} CAR-YEARS LIVED`
        : "EVERY CAR IS A PROGRAM THAT LIVES AS LONG AS THE CAR"}
    </p>
  );
}
