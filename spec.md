# The Living Lot

### A Temporal demo where every car is a program that lives as long as the car does

**One sentence:** Each vehicle on a dealership lot is a single Temporal Workflow, started the moment the car is built and still running years later through every test drive, sale, service visit, recall, and trade-in, ending only when the car is physically scrapped.

**Why this entity:** A car is the most universal "thing that persists" an audience can hold in their head. Everyone intuitively accepts that a car has a lifetime measured in years and a history worth keeping. So the moment you say "this one program has been running for the entire life of this car," nobody has to be taught what a car is, and the strangeness lands immediately. The dealership lot gives you a natural grid of many such lives running at once.

---

## 1. The core idea we are demonstrating

We are showing the inversion of the normal model of software:

- **Normal model:** a request comes in, a process runs, a response goes out, the process ends, and whatever mattered gets flattened into a database row. The program is a momentary event; the database is the only thing that remembers.
- **Entity Workflow model:** the program *is* the thing. It starts when the thing comes into existence, holds its own state in memory durably, responds to messages for years, and ends only when the thing itself ends. There is no separate "save the leftovers" step, because the program never leaves.

The car makes this visceral. The loan (a child entity) makes it composable. The recall (a fleet operation) makes it scale. The crash test makes it real.

---

## 2. The entity: `vehicleLifecycle`

One running execution per VIN. The Workflow ID **is** the VIN, which means the car is addressable by name forever: any service, anywhere, at any future date, can signal or query this exact car with nothing but its VIN.

### 2.1 State carried inside the Workflow

```ts
type VehicleStatus =
  | 'manufactured'   // born, not yet shipped
  | 'in_transit'     // on the way to a lot
  | 'on_lot'         // for sale
  | 'sold'           // owned, on the road
  | 'in_service'     // at the shop
  | 'recalled'       // open recall, sale blocked
  | 'traded_in'      // back to a dealer
  | 'scrapped';      // the only terminal state

interface VehicleState {
  vin: string;
  make: string;
  model: string;
  year: number;
  status: VehicleStatus;
  odometer: number;
  price?: number;            // current asking price while on_lot
  listedAtMs?: number;       // when it landed on the lot (drives auto price drops)
  currentOwner?: string;
  lotLocation?: string;
  openRecalls: Recall[];
  serviceRecords: ServiceRecord[];
  financeWorkflowId?: string; // child loan entity, if financed
  bornAtMs: number;
}
```

> Design note: keep this **decision centric, not warehouse centric.** Service records are a thin log (date, mileage, work, cost), not blobs. Large artifacts (PDF inspection reports, photos) live in object storage and are referenced by URL through an Activity. This is the discipline that lets the entity run for years without history bloat.

### 2.2 Signals (fire and forget commands)

```ts
const arriveOnLot   = defineSignal<[{ location: string; price: number }]>('arriveOnLot');
const recordTestDrive = defineSignal<[{ driver: string; miles: number }]>('recordTestDrive');
const logService    = defineSignal<[ServiceRecord]>('logService');
const issueRecall   = defineSignal<[Recall]>('issueRecall');
const reportAccident= defineSignal<[{ severity: 'minor' | 'major' | 'total'; miles: number }]>('reportAccident');
const tradeIn       = defineSignal<[{ dealerId: string; appraisal: number }]>('tradeIn');
const scrap         = defineSignal<[{ reason: string }]>('scrap'); // the natural death
```

### 2.3 Queries (read only, never mutate history)

```ts
const getSnapshot = defineQuery<VehicleState>('getSnapshot');
const getHistory  = defineQuery<HistoryReport>('getHistory'); // the auto-generated Carfax
```

### 2.4 Update (request and response, with a validator: the DDD payoff)

```ts
const requestSale = defineUpdate<SaleResult, [SaleInput]>('requestSale');
```

The Update handler is registered with a **validator** that rejects the sale before anything is recorded if the car is not actually sellable:

```ts
setHandler(requestSale, handleSale, {
  validator(input: SaleInput) {
    if (state.status !== 'on_lot')        throw new Error('Vehicle is not for sale');
    if (state.openRecalls.length > 0)     throw new Error('Cannot sell a vehicle under open recall');
    if (input.salePrice < state.price! * 0.5) throw new Error('Offer below floor');
  },
});
```

This is the line that turns the talk from "neat" into "oh." The Workflow **is the consistency boundary** for this car. You cannot sell a recalled car, not because some service remembered to check, but because the entity that owns the car's state refuses the command at the door. The invariant lives with the thing it protects. (This is the DDD aggregate-root point made physical: one entity, one boundary, one set of rules, enforced in one place.)

### 2.5 Durable timers (the "sleep for three years" trick)

Inside the main loop the entity also runs long timers concurrently with message handling:

- **Auto price drop:** if still `on_lot` after `daysOnLotThreshold`, drop the price by a step and emit a `PriceReduced` event, then keep waiting. In the real world this is weeks. On stage it is seconds (see Section 7).
- **Warranty clock:** a `sleep` of "3 years" from sale that fires a `WarrantyExpired` event. This single line, a multi-year sleep that just works, is one of the most quietly astonishing things to show.
- **Service reminder:** every "6 months" or every 5,000 miles, whichever first.

### 2.6 The loop and Continue-As-New (how it runs forever)

```ts
export async function vehicleLifecycle(state: VehicleState): Promise<void> {
  setHandlers(state);              // wire signals, queries, the sale update
  await indexForSearch(state);     // upsert search attributes so the lot dashboard can find it

  while (state.status !== 'scrapped') {
    // wait for the next meaningful thing: a command, a timer, or a death
    await condition(() => state.dirty || state.status === 'scrapped');
    state.dirty = false;

    // roll the entity forward into a fresh history before it grows too large
    if (workflowInfo().continueAsNewSuggested) {
      await continueAsNew<typeof vehicleLifecycle>(compact(state));
    }
  }
  // car is scrapped: the program, like the car, is finally allowed to end
}
```

`continueAsNew` is the mechanism that lets a workflow "run forever" without an ever-growing event log: it atomically closes the current run and starts a fresh one carrying the compacted state. We trigger it on `continueAsNewSuggested` (history approaching the recommended threshold), which keeps every car cheap to run no matter how long it has lived. This is also the moment to call out the one real operational rule from the durable-execution world: long-lived entities must roll forward, or their history bloats. We show the right way on purpose.

---

## 3. The child entity: `autoLoan`

When a car is sold with financing, the sale handler starts a **child** Workflow:

```ts
const loanId = `loan-${state.vin}`;
await startChild(autoLoan, {
  workflowId: loanId,
  args: [{ vin: state.vin, principal, apr, termMonths: 60 }],
});
state.financeWorkflowId = loanId;
```

`autoLoan` is itself an entity: it runs for the full 60-month term, sleeps between due dates, accepts `makePayment` signals, emits `PaymentMissed` and `Delinquent` events, and completes only when the balance hits zero or the car is totaled. Now two immortal things, the car and its loan, are running side by side and referencing each other by ID. This is entity composition, and it shows the pattern is not a toy: real businesses are made of many long-lived things that point at each other.

---

## 4. The fleet operation: a recall to every matching car at once

A recall is not a per-car action, it is a population action, and it is the scale moment of the demo.

```ts
// list every running vehicle of a given model via Visibility / Search Attributes
const handles = client.workflow.list({
  query: `WorkflowType='vehicleLifecycle' AND Make='Honda' AND Model='Civic' AND VehicleYear=2024 AND Status!='scrapped'`,
});
for await (const wf of handles) {
  await client.workflow.getHandle(wf.workflowId).signal(issueRecall, recall);
}
```

One command fans a recall out to every living 2024 Civic on the lot (or in the world, in the framing). Each car reacts on its own: flips to `recalled`, blocks its own sale via the validator from Section 2.4, and fires a `sendRecallNotice` Activity to its owner. Each car was individually addressable, by name, the entire time. Nobody maintained a list of which cars needed it; the population query found them.

---

## 5. Activities (the side effects, quarantined outside replay)

Everything that touches the outside world is an Activity, which is what keeps the Workflow deterministic and replayable:

| Activity | Side effect | Demoed for |
| --- | --- | --- |
| `projectToReadModel` | upsert a row in Postgres/Supabase for the dashboard | shows the DB is optional, a convenience read model, not the source of truth |
| `sendRecallNotice` | email/SMS the current owner | the failure-and-retry beat (kill the mail service, watch it retry, then succeed) |
| `fetchMarketValue` | call a pricing API | external dependency that can fail without losing the entity |
| `renderHistoryReport` | produce the shareable PDF Carfax | the "you didn't build this" beat |

Key teaching point baked into the architecture: **Activities can be changed freely, Workflows cannot.** The pricing logic, the email template, the report renderer all live in Activities precisely because they are the volatile parts. The car's life story (the orchestration) is the stable spine.

---

## 6. The dashboard is a query, not a table

This is a subtle but powerful reframe to surface in the spec and the talk. The "cars currently on the lot" view is not `SELECT * FROM cars WHERE status='on_lot'`. It is a Visibility query over **running programs**:

```
WorkflowType='vehicleLifecycle' AND Status='on_lot'
```

The lot you are looking at is a window into a population of living entities. The grid is just the entities that currently answer "yes" to "are you for sale." Search attributes to declare: `Make`, `Model`, `VehicleYear`, `Status`, `LotLocation`, `CurrentOwner`, `ListedAt`.

### UI surfaces

1. **Lot grid:** one card per car, live state (status badge, price, odometer, days on lot). Cards refresh by polling `getSnapshot` or by reading the projected read model.
2. **Car detail / lifeline:** click a car to see its lifecycle timeline rendered straight from the entity's memory. This is the auto-generated history report. Put the raw Temporal Web UI event history side by side with the pretty rendered version so the audience sees they are the same thing.
3. **Control panel:** big stage-friendly buttons to fire signals live: Sell, Log Service, Report Accident, Trade In, Scrap.
4. **Chaos panel:** Kill Worker, Restart Worker, Break Mail Service (force `sendRecallNotice` to fail), Heal. This panel runs the resilience beats.
5. **Demo clock:** shows compressed time and the current time scale, plus a live counter: `N living vehicles, ~M years of history simulated, 0 lines of persistence you wrote`.

---

## 7. Time compression (so years happen on stage in seconds)

Temporal sleeps are real wall-clock by default, which is the whole point in production and a problem for a 12-minute talk. Two honest options:

- **Recommended for a live UI demo: a `DEMO_TIME_SCALE` factor.** Every durable sleep is written as `await sleep(realDuration / DEMO_TIME_SCALE)`. Set the scale so one simulated day is roughly one second (`DEMO_TIME_SCALE = 86400`). The Workflow is still genuinely running on a real server against a real timer; you have only changed the wall-clock duration. Robust, and what the audience sees is true.
- **For deterministic rehearsal: the time-skipping test server** (`@temporalio/testing`), which fast-forwards timers instantly. Great for automated tests and dry runs, less natural for a live audience-facing UI. Use it to rehearse and to write replay tests, run the show on the scale factor.

Expose the scale in the demo clock so the audience knows you are compressing time, not faking it.

---

## 8. Tech stack

Chosen to be a single laptop, no cloud dependency, fast to stand up, and aligned with a modern TypeScript shop:

- **Temporal:** local dev server via `temporal server start-dev` (bundles the Web UI at `localhost:8233`).
- **SDK:** `@temporalio/worker`, `@temporalio/client`, `@temporalio/workflow` (TypeScript).
- **Worker:** a standalone Node process you can kill and restart on stage (this is the crash beat, so it must be its own process).
- **Dashboard:** Next.js + Tailwind, talking to Temporal through a thin server-side client.
- **Read model (optional):** Supabase/Postgres, written only by the `projectToReadModel` Activity, used purely to make the grid snappy. Deleting it mid-demo and watching the entities rebuild it is an optional flex.

Architecture in one line: **Dashboard (Next.js) -> Temporal Client -> Temporal Server <- Worker (your Workflows + Activities) -> Read model + outside world.**

---

## 9. The wow beats, mapped to exactly what happens

| # | Stage action | What the audience sees | What is actually happening | The line that lands |
| --- | --- | --- | --- | --- |
| 1 | Sell a car | Card flips to Sold, owner appears | A signal mutated in-memory entity state | "I never wrote a database. Where did that go?" |
| 2 | Kill the worker, then restart | Card freezes, then resumes exactly where it was | Workflow state was durable in Temporal; the worker just re-attaches and replays | "I did not write one line to save that. It is crash-proof by construction." |
| 3 | Fast-forward the demo clock | Price auto-drops, warranty timer fires | A multi-year durable `sleep` woke up | "A program that can sleep for three years and wake up on time." |
| 4 | Open a car's lifeline | Full vehicle history, beautifully laid out | The Workflow's event history, rendered | "You have seen one of these. Someone built a company on it. This one built itself." |
| 5 | Show the loan that the sale spawned | A second living timeline, 60 months long | A child entity Workflow running alongside the car | "Two immortal things, the car and its loan, living together." |
| 6 | Issue a recall to a whole model | Every matching card turns red at once and refuses to sell | One fan-out query signalled every matching running entity | "Each car was addressable, by name, the whole time. Nobody kept the list." |
| 7 | Try to sell a recalled car | The sale is rejected instantly | The Update validator enforced the invariant at the boundary | "The car itself refused. The rule lives with the thing it protects." |
| 8 | Scrap a car | Card goes dark, timeline closes | The only terminal state; the loop exits | "The program ends when the car ends. Not a second before." |

---

## 10. Build plan

1. **Skeleton (0.5 day):** `vehicleLifecycle` with state, the signal/query handlers, the main loop, and `continueAsNew`. Worker + client. Start one car from a script, signal it, query it. Prove durability by killing the worker.
2. **Lot dashboard (1 day):** Next.js grid reading the read model, car detail page rendering `getHistory`, control-panel buttons wired to signals.
3. **Time + timers (0.5 day):** `DEMO_TIME_SCALE`, auto price drop, warranty clock, demo clock widget.
4. **The sale Update + validator (0.5 day):** request-and-response sale with the recalled-car rejection.
5. **Loan child entity (0.5 day):** `autoLoan`, spawned on financed sales, its own timeline view.
6. **Recall fan-out (0.5 day):** the population query and the chaos/recall panel.
7. **Resilience theater (0.5 day):** kill/restart worker controls, breakable mail Activity, the live counters.
8. **Polish + rehearsal (1 day):** seed data (a lot of 30 to 50 cars with varied histories so it feels alive), replay tests, and the fallback recording.

Roughly a week to a genuinely tight demo, two to three days to a rough but real one.

---

## 11. Stage reliability (the demo gods are not kind)

Live Temporal demos fail in boring ways; plan for them.

- **Pre-seed** a fully populated lot with rich, varied histories before you walk on stage, so even if you fire nothing live it already looks alive.
- **Pin `DEMO_TIME_SCALE`** to a rehearsed value; do not improvise the speed of time on stage.
- **Two terminals visible:** the worker and the server, so the kill/restart beat is legible to the room.
- **Replay tests in CI** for `vehicleLifecycle` and `autoLoan`, using downloaded histories, so a code change never silently breaks determinism the morning of the talk.
- **Record a clean run** end to end as a fallback video. If the network or the projector betrays you, you narrate over the recording and the audience never knows.
- **Have one hero car** with a deep, interesting history (built 2019, three owners, a fender bender, a recall, a loan paid off early) that you return to as the emotional anchor.

---

## 12. Stretch goals (if you want to go further)

- **A QR code on the projector** that resolves to `getHistory(vin)` so the audience can pull the live history of the hero car on their own phones, mid-talk.
- **Insurance as another child entity** on the same car, to deepen the composition point.
- **A "digital twin" framing**: stream a fake telemetry signal (odometer ticking up live) so the entity visibly breathes.
- **Total it on stage:** `reportAccident('total')` cascades: the car moves toward `scrapped` and signals its loan to settle. Two linked lives ending together is a strong, slightly poignant closer.