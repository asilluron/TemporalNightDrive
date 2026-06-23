"use client";

import type { LoanState, VehicleState } from "@/temporal/types";

const LOTS = ["A12", "B07", "C23", "D41", "E09"];
const BUYERS = ["Marty McFly", "Kavinsky", "The Midnight", "Doc Brown"];
const rand = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

// The Inspector reads one entity's live in-memory state (its Query snapshot)
// and exposes the Signals / Update that drive its lifecycle.
export function Inspector({
  vehicle,
  loan,
  busy,
  saleError,
  onSignal,
  onSell,
  onPayLoan,
}: {
  vehicle: VehicleState | null;
  loan: LoanState | null;
  busy: boolean;
  saleError: string | null;
  onSignal: (signal: string, args: unknown[]) => void;
  onSell: () => void;
  onPayLoan: () => void;
}) {
  if (!vehicle) {
    return (
      <div className="inspector">
        <p className="placeholder">SELECT A CAR ON THE LOT TO INSPECT ITS ENTITY</p>
      </div>
    );
  }

  const onLot = vehicle.status === "on_lot";
  const dead = vehicle.status === "scrapped";

  return (
    <div className="inspector">
      <div className="inspector-head">
        <h2>
          {vehicle.year} {vehicle.make} {vehicle.model}
        </h2>
        <span className={`badge ${vehicle.status}`}>
          {vehicle.status.replace("_", " ").toUpperCase()}
        </span>
      </div>

      <Line label="VIN (Workflow ID)" value={vehicle.vin} />
      {vehicle.price != null && <Line label="Asking Price" value={`$${vehicle.price.toLocaleString()}`} />}
      {vehicle.lotLocation && <Line label="Lot Location" value={vehicle.lotLocation} />}
      {vehicle.currentOwner && <Line label="Owner" value={vehicle.currentOwner} />}
      <Line label="Odometer" value={`${vehicle.odometer.toLocaleString()} mi`} />
      <Line label="Open Recalls" value={String(vehicle.openRecalls.length)} />

      <div className="action-grid">
        <button className="btn cyan sm" disabled={busy || dead || onLot}
          onClick={() => onSignal("arriveOnLot", [{ location: rand(LOTS) }])}>Send to Lot</button>
        <button className="btn sm" disabled={busy || !onLot}
          onClick={() => onSignal("recordTestDrive", [{ driver: rand(BUYERS), miles: 12 }])}>Test Drive</button>
        <button className="btn sm" disabled={busy || dead}
          onClick={() => onSignal("logService", [{ date: new Date().toISOString().slice(0, 10), mileage: vehicle.odometer + 1, work: "Oil change", cost: 89 }])}>Log Service</button>
        <button className="btn cyan sm" disabled={busy || !onLot} onClick={onSell}>Sell (Update)</button>
        <button className="btn sm" disabled={busy || dead}
          onClick={() => onSignal("issueRecall", [{ reason: "Faulty flux capacitor" }])}>Issue Recall</button>
        <button className="btn sm" disabled={busy || dead}
          onClick={() => onSignal("reportAccident", [{ severity: "minor", miles: 0 }])}>Report Accident</button>
        <button className="btn danger sm" disabled={busy || dead}
          onClick={() => onSignal("scrap", [{ reason: "End of life" }])}>Scrap</button>
      </div>

      {saleError && <p className="error sm">SALE REJECTED: {saleError}</p>}

      {loan && <LoanPanel loan={loan} busy={busy} onPay={onPayLoan} />}

      <Lifeline vehicle={vehicle} />
    </div>
  );
}

function LoanPanel({ loan, busy, onPay }: { loan: LoanState; busy: boolean; onPay: () => void }) {
  return (
    <div className="loan-panel">
      <div className="loan-head">
        <span>AUTO LOAN · {loan.loanId}</span>
        <span className={`badge ${loan.status}`}>{loan.status.replace("_", " ").toUpperCase()}</span>
      </div>
      <Line label="Balance" value={`$${loan.balance.toLocaleString()} / $${loan.principal.toLocaleString()}`} />
      <Line label="Monthly" value={`$${loan.monthlyPayment.toLocaleString()}`} />
      <Line label="Payments Made" value={String(loan.paymentsMade)} />
      <button className="btn cyan sm" disabled={busy || loan.balance <= 0} onClick={onPay}>
        Make Payment (${loan.monthlyPayment.toLocaleString()})
      </button>
    </div>
  );
}

function Lifeline({ vehicle }: { vehicle: VehicleState }) {
  return (
    <div className="lifeline">
      <span className="lifeline-title">LIFELINE</span>
      <ul>
        {[...vehicle.lifeline].reverse().map((e, i) => (
          <li key={i}>
            <span className="lifeline-kind">{e.kind}</span>
            <span className="lifeline-detail">{e.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="line">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}
