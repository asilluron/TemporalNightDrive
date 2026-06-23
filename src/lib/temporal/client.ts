// Server-side Temporal client. The dashboard talks to Temporal only through
// this thin layer — never from the browser. The connection is cached across
// hot reloads so we don't open a new gRPC channel on every request.
import "server-only";
import { Client, Connection } from "@temporalio/client";

declare global {
  // eslint-disable-next-line no-var
  var __temporalClient: Client | undefined;
}

export async function getTemporalClient(): Promise<Client> {
  if (globalThis.__temporalClient) {
    return globalThis.__temporalClient;
  }

  const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";

  const connection = await Connection.connect({ address });
  const client = new Client({ connection, namespace });

  globalThis.__temporalClient = client;
  return client;
}
