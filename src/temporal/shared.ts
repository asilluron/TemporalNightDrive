// Constants + helpers shared across the Worker, the Workflows and the Next.js
// server layer. No Temporal SDK imports here so it is safe in any runtime.
export * from "./types";

// This module is imported by the Workflows too, and `process` does not exist
// inside Temporal's Workflow sandbox — so read env defensively. The sandbox
// always falls back to the defaults below (which is the intended demo behavior).
const env: Record<string, string | undefined> =
  typeof process !== "undefined" ? process.env : {};

export const TASK_QUEUE = env.TEMPORAL_TASK_QUEUE ?? "living-lot";

// How fast simulated time runs. 86400 => one simulated day per real second.
// Every durable sleep is written as realMs / DEMO_TIME_SCALE so the entity is
// genuinely running on a real timer — we have only changed the wall-clock span.
export const DEMO_TIME_SCALE = Number(env.DEMO_TIME_SCALE ?? 86400);

const DAY_MS = 24 * 60 * 60 * 1000;

// Translate a real-world duration (in days) into a demo-scaled millisecond delay.
export function scaledDays(days: number): number {
  return Math.max(1, Math.round((days * DAY_MS) / DEMO_TIME_SCALE));
}

// A vehicle's Workflow ID *is* its VIN — addressable by name forever.
export function workflowIdForVin(vin: string): string {
  return vin;
}

export function loanIdForVin(vin: string): string {
  return `loan-${vin}`;
}

export function randomVin(): string {
  const chars = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
  let vin = "";
  for (let i = 0; i < 17; i++) {
    vin += chars[Math.floor(Math.random() * chars.length)];
  }
  return vin;
}
