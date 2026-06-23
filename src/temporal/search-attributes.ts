// Typed Search Attributes — the lot dashboard is a Visibility *query* over the
// population of running entities, not a SELECT over a table. These keys are
// registered with the dev server (see docker-compose) and upserted by the
// vehicleLifecycle workflow so the grid can find living cars by their state.
import {
  defineSearchAttributeKey,
  SearchAttributeType,
  type SearchAttributePair,
} from "@temporalio/common";
import type { VehicleState } from "./types";

export const SA = {
  Make: defineSearchAttributeKey("Make", SearchAttributeType.KEYWORD),
  Model: defineSearchAttributeKey("Model", SearchAttributeType.KEYWORD),
  VehicleYear: defineSearchAttributeKey("VehicleYear", SearchAttributeType.INT),
  Status: defineSearchAttributeKey("Status", SearchAttributeType.KEYWORD),
  LotLocation: defineSearchAttributeKey(
    "LotLocation",
    SearchAttributeType.KEYWORD,
  ),
  CurrentOwner: defineSearchAttributeKey(
    "CurrentOwner",
    SearchAttributeType.KEYWORD,
  ),
  ListedAt: defineSearchAttributeKey("ListedAt", SearchAttributeType.DATETIME),
} as const;

// KEY=Type pairs for `temporal server start-dev --search-attribute ...`.
export const SEARCH_ATTRIBUTE_FLAGS: string[] = [
  "Make=Keyword",
  "Model=Keyword",
  "VehicleYear=Int",
  "Status=Keyword",
  "LotLocation=Keyword",
  "CurrentOwner=Keyword",
  "ListedAt=Datetime",
];

// Build the upsert payload from current entity state.
export function vehicleSearchAttributes(
  state: VehicleState,
): SearchAttributePair[] {
  return [
    { key: SA.Make, value: state.make },
    { key: SA.Model, value: state.model },
    { key: SA.VehicleYear, value: state.year },
    { key: SA.Status, value: state.status },
    { key: SA.LotLocation, value: state.lotLocation ?? "" },
    { key: SA.CurrentOwner, value: state.currentOwner ?? "" },
    { key: SA.ListedAt, value: new Date(state.listedAtMs ?? state.bornAtMs) },
  ];
}
