// Long-running durable timers that run concurrently with message handling.
// Written as scaled sleeps so "3 years" happens on stage in seconds. They live
// inside a CancellationScope in the workflow and exit when the car is scrapped.
import { sleep, condition } from "@temporalio/workflow";
import { scaledDays } from "./shared";
import { pushEvent, isScrapped } from "./vehicle-state";
import type { VehicleState } from "./types";

const PRICE_DROP_DAYS = 14;
const WARRANTY_DAYS = 365 * 3;
const SERVICE_DAYS = 182;

// If still on_lot after the threshold, drop the price a step and keep waiting.
export async function priceDropLoop(
  state: VehicleState,
  reindex: () => void,
): Promise<void> {
  while (state.status !== "scrapped") {
    await sleep(scaledDays(PRICE_DROP_DAYS));
    if (state.status === "on_lot" && state.price) {
      state.price = Math.round(state.price * 0.95);
      pushEvent(state, Date.now(), "PriceReduced", `Auto price drop to $${state.price}`);
      reindex();
    }
  }
}

// A multi-year sleep from the moment of sale that just works.
export async function warrantyLoop(state: VehicleState): Promise<void> {
  await condition(() => state.status === "sold" || isScrapped(state));
  if (isScrapped(state)) return;
  await sleep(scaledDays(WARRANTY_DAYS));
  if (!isScrapped(state)) {
    pushEvent(state, Date.now(), "WarrantyExpired", "3-year warranty expired");
  }
}

// Every ~6 months, nudge a service reminder once the car is on the road.
export async function serviceReminderLoop(state: VehicleState): Promise<void> {
  while (state.status !== "scrapped") {
    await sleep(scaledDays(SERVICE_DAYS));
    if (state.status === "sold" || state.status === "recalled") {
      pushEvent(state, Date.now(), "ServiceDue", "Service reminder: 6 months / 5,000 mi");
    }
  }
}
