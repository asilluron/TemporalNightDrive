// Unit test for rejectionReason — the helper that unwraps a rejected Workflow
// Update so the dashboard shows the validator's real reason. A rejected Update
// nests its message under WorkflowUpdateFailedError -> ApplicationFailure, so we
// assert the cause chain is walked to the deepest Error.
import assert from "node:assert";
import { rejectionReason } from "../src/lib/sale-error";

let passed = 0;
function check(name: string, actual: string, expected: string): void {
  assert.strictEqual(actual, expected, `${name}: expected "${expected}", got "${actual}"`);
  console.log(`  ✓ ${name}`);
  passed++;
}

function main(): void {
  // Nested cause: mirrors WorkflowUpdateFailedError -> ApplicationFailure -> reason.
  const nested = new Error("Workflow Update failed", {
    cause: new Error("ApplicationFailure", {
      cause: new Error("Vehicle is not for sale"),
    }),
  });
  check("nested cause", rejectionReason(nested), "Vehicle is not for sale");

  // Single level of nesting.
  const single = new Error("wrapper", { cause: new Error("Offer below floor") });
  check("single cause", rejectionReason(single), "Offer below floor");

  // Flat error: no cause, return its own message.
  check("flat error", rejectionReason(new Error("boom")), "boom");

  // Non-Error inputs fall back to the generic message.
  check("string input", rejectionReason("nope"), "sale rejected");
  check("undefined input", rejectionReason(undefined), "sale rejected");
  check("object input", rejectionReason({ message: "x" }), "sale rejected");

  // A non-Error cause stops the walk at the last real Error.
  const stops = new Error("real reason", { cause: "not an error" });
  check("non-error cause", rejectionReason(stops), "real reason");

  console.log(`[sale-error] PASS — ${passed} assertions.`);
}

try {
  main();
} catch (err) {
  console.error("[sale-error] FAIL —", err instanceof Error ? err.message : err);
  process.exit(1);
}
