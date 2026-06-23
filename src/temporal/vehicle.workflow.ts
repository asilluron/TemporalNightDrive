// The entity. One running execution per VIN, alive from manufacture until the
// car is scrapped. State lives in memory, durably, for the life of the car.
import {
  setHandler,
  condition,
  defineQuery,
  defineSignal,
  defineUpdate,
  proxyActivities,
  CancellationScope,
  startChild,
  getExternalWorkflowHandle,
  workflowInfo,
  continueAsNew,
  upsertSearchAttributes,
  ParentClosePolicy,
  log,
} from "@temporalio/workflow";
import type * as activities from "./activities";
import { scaledDays, loanIdForVin } from "./shared";
import type { Recall, SaleInput, SaleResult, ServiceRecord, VehicleState } from "./types";
import {
  createInitialState,
  pushEvent,
  compact,
  buildHistoryReport,
  type HistoryReport,
} from "./vehicle-state";
import { vehicleSearchAttributes } from "./search-attributes";
import { priceDropLoop, warrantyLoop, serviceReminderLoop } from "./vehicle-timers";
import { autoLoan, settleLoan } from "./loan.workflow";

const { stampVehicle, fetchMarketValue, projectToReadModel, sendRecallNotice } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
    retry: { maximumAttempts: 8 },
  });

export const getSnapshot = defineQuery<VehicleState>("getSnapshot");
export const getHistory = defineQuery<HistoryReport>("getHistory");
export const arriveOnLot = defineSignal<[{ location: string; price?: number }]>("arriveOnLot");
export const recordTestDrive = defineSignal<[{ driver: string; miles: number }]>("recordTestDrive");
export const logService = defineSignal<[ServiceRecord]>("logService");
export const issueRecall = defineSignal<[{ reason: string }]>("issueRecall");
export const reportAccident =
  defineSignal<[{ severity: "minor" | "major" | "total"; miles: number }]>("reportAccident");
export const tradeIn = defineSignal<[{ dealerId: string; appraisal: number }]>("tradeIn");
export const scrap = defineSignal<[{ reason: string }]>("scrap");
export const requestSale = defineUpdate<SaleResult, [SaleInput]>("requestSale");

const PRICE_FLOOR = 0.5;

export interface VehicleInput {
  vin: string;
  restore?: VehicleState;
  // Optional factory order: pin the make/model/year instead of letting the
  // stamping activity pick at random. Used to manufacture a known hero car.
  seed?: { make: string; model: string; year: number };
}

export async function vehicleLifecycle(input: VehicleInput): Promise<void> {
  let state: VehicleState;
  if (input.restore) {
    state = input.restore;
  } else if (input.seed) {
    state = createInitialState({ vin: input.vin, ...input.seed }, Date.now());
  } else {
    const profile = await stampVehicle(input.vin);
    state = createInitialState(profile, Date.now());
  }

  const index = () => upsertSearchAttributes(vehicleSearchAttributes(state));
  const terminal = () => state.status === "scrapped";

  setHandler(getSnapshot, () => state);
  setHandler(getHistory, () => buildHistoryReport(state));

  setHandler(arriveOnLot, async ({ location, price }) => {
    state.status = "on_lot";
    state.lotLocation = location;
    state.listedAtMs = Date.now();
    state.price = price ?? (await fetchMarketValue(state));
    pushEvent(state, Date.now(), "ArrivedOnLot", `Lot ${location} @ $${state.price}`);
    index();
    await projectToReadModel(state);
  });

  setHandler(recordTestDrive, ({ driver, miles }) => {
    state.odometer += miles;
    pushEvent(state, Date.now(), "TestDrive", `${driver} drove ${miles} mi`);
  });

  setHandler(logService, (rec: ServiceRecord) => {
    state.serviceRecords.push(rec);
    state.odometer = Math.max(state.odometer, rec.mileage);
    pushEvent(state, Date.now(), "Service", `${rec.work} ($${rec.cost})`);
  });

  setHandler(issueRecall, async ({ reason }) => {
    const recall: Recall = {
      id: `R-${state.openRecalls.length + 1}`,
      reason,
      issuedAtMs: Date.now(),
      noticeSent: false,
    };
    state.openRecalls.push(recall);
    if (state.status === "on_lot" || state.status === "sold") state.status = "recalled";
    pushEvent(state, Date.now(), "Recalled", reason);
    index();
    if (state.currentOwner) {
      await sendRecallNotice(state.currentOwner, reason);
      recall.noticeSent = true;
    }
  });

  setHandler(reportAccident, async ({ severity, miles }) => {
    state.odometer += miles;
    pushEvent(state, Date.now(), "Accident", `${severity} accident`);
    if (severity === "total") {
      if (state.financeWorkflowId) {
        await getExternalWorkflowHandle(state.financeWorkflowId).signal(settleLoan, {
          reason: "Vehicle totaled",
        });
      }
      state.status = "scrapped";
      pushEvent(state, Date.now(), "Scrapped", "Totaled in accident");
      index();
    }
  });

  setHandler(tradeIn, ({ dealerId, appraisal }) => {
    state.status = "traded_in";
    state.currentOwner = dealerId;
    pushEvent(state, Date.now(), "TradedIn", `Dealer ${dealerId} appraised $${appraisal}`);
    index();
  });

  setHandler(scrap, ({ reason }) => {
    state.status = "scrapped";
    pushEvent(state, Date.now(), "Scrapped", reason);
    index();
  });

  setHandler(
    requestSale,
    async (sale: SaleInput): Promise<SaleResult> => {
      state.status = "sold";
      state.currentOwner = sale.buyer;
      pushEvent(state, Date.now(), "Sold", `Sold to ${sale.buyer} for $${sale.salePrice}`);
      const result: SaleResult = {
        vin: state.vin,
        buyer: sale.buyer,
        salePrice: sale.salePrice,
        soldAtMs: Date.now(),
      };
      if (sale.financed) {
        const loanId = loanIdForVin(state.vin);
        await startChild(autoLoan, {
          workflowId: loanId,
          args: [{ vin: state.vin, principal: sale.salePrice, apr: 0.06, termMonths: 60 }],
          parentClosePolicy: ParentClosePolicy.ABANDON,
        });
        state.financeWorkflowId = loanId;
        result.loanWorkflowId = loanId;
      }
      index();
      await projectToReadModel(state);
      return result;
    },
    {
      // The consistency boundary: the car itself refuses an illegal sale.
      validator(sale: SaleInput) {
        if (state.status !== "on_lot") throw new Error("Vehicle is not for sale");
        if (state.openRecalls.length > 0)
          throw new Error("Cannot sell a vehicle under open recall");
        if (state.price && sale.salePrice < state.price * PRICE_FLOOR)
          throw new Error("Offer below floor");
      },
    },
  );

  index();
  await projectToReadModel(state);
  log.info("Vehicle online", { vin: state.vin, status: state.status });

  const timerScope = new CancellationScope();
  const timers = timerScope.run(() =>
    Promise.all([priceDropLoop(state, index), warrantyLoop(state), serviceReminderLoop(state)]),
  );
  timers.catch(() => undefined);

  await condition(() => terminal() || workflowInfo().continueAsNewSuggested);
  timerScope.cancel();
  await timers.catch(() => undefined);

  if (!terminal()) {
    await continueAsNew<typeof vehicleLifecycle>({ vin: state.vin, restore: compact(state) });
  }
}
