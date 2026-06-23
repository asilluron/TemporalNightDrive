"use client";

import type { VehicleState } from "@/temporal/types";

// The lot floor: one card per living entity returned by the Visibility query.
// Clicking a card selects it for the Inspector. Each card glows by status so
// the population's health is legible at a glance.
export function LotGrid({
  vehicles,
  selectedVin,
  onSelect,
}: {
  vehicles: VehicleState[];
  selectedVin: string | null;
  onSelect: (vin: string) => void;
}) {
  if (vehicles.length === 0) {
    return (
      <div className="lot-empty">
        <p className="placeholder">
          THE LOT IS EMPTY — MANUFACTURE A VEHICLE TO BIRTH AN ENTITY
        </p>
      </div>
    );
  }

  return (
    <div className="lot-grid">
      {vehicles.map((v) => (
        <button
          key={v.vin}
          className={`lot-card ${v.status} ${v.vin === selectedVin ? "selected" : ""}`}
          onClick={() => onSelect(v.vin)}
          title={v.vin}
        >
          <span className="lot-card-make">
            {v.year} {v.make}
          </span>
          <span className="lot-card-model">{v.model}</span>
          <span className={`badge ${v.status}`}>{v.status.replace("_", " ").toUpperCase()}</span>
          <span className="lot-card-meta">
            {v.price != null ? `$${v.price.toLocaleString()}` : `${v.odometer.toLocaleString()} mi`}
          </span>
          {v.openRecalls.length > 0 && <span className="lot-card-recall">⚠ RECALL</span>}
          <span className="lot-card-vin">{v.vin.slice(0, 8)}…</span>
        </button>
      ))}
    </div>
  );
}
