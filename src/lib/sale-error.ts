// A rejected Workflow Update throws a WorkflowUpdateFailedError whose human
// reason (e.g. "Vehicle is not for sale") lives on the wrapped cause, not the
// top-level message. Walk the cause chain to the deepest Error so the dashboard
// shows why the car refused the sale instead of the generic wrapper text.
export function rejectionReason(err: unknown): string {
  if (!(err instanceof Error)) return "sale rejected";
  let current: Error = err;
  while (current.cause instanceof Error) {
    current = current.cause;
  }
  return current.message;
}
