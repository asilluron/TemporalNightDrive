// Standalone Worker process. Kill it and restart it on stage — the entities
// keep their state in Temporal and the worker simply re-attaches and replays.
import { Worker, NativeConnection } from "@temporalio/worker";
import { Connection } from "@temporalio/client";
import * as activities from "./activities";
import { TASK_QUEUE } from "./shared";
import { SEARCH_ATTRIBUTE_FLAGS } from "./search-attributes";

// IndexedValueType proto enum values, keyed by the human names used in the
// --search-attribute flags and the docker-compose file.
const TYPE_TO_ENUM: Record<string, number> = {
  Text: 1,
  Keyword: 2,
  Int: 3,
  Double: 4,
  Bool: 5,
  Datetime: 6,
  KeywordList: 7,
};

// The lot dashboard is a Visibility query over custom Search Attributes. The
// dev server only registers them via --search-attribute when the container is
// first created, so an existing server silently lacks them and every entity's
// upsert fails its Workflow Task. Register any missing ones at startup so the
// worker is self-healing no matter how Temporal was launched.
async function ensureSearchAttributes(address: string, namespace: string): Promise<void> {
  const desired: Record<string, number> = {};
  for (const flag of SEARCH_ATTRIBUTE_FLAGS) {
    const [name, type] = flag.split("=");
    desired[name] = TYPE_TO_ENUM[type];
  }

  const connection = await Connection.connect({ address });
  try {
    const existing = await connection.operatorService.listSearchAttributes({ namespace });
    const have = existing.customAttributes ?? {};
    const missing = Object.fromEntries(
      Object.entries(desired).filter(([name]) => have[name] === undefined),
    );

    if (Object.keys(missing).length === 0) {
      console.log("[living-lot] search attributes already registered");
      return;
    }

    await connection.operatorService.addSearchAttributes({ namespace, searchAttributes: missing });
    console.log(`[living-lot] registered search attributes: ${Object.keys(missing).join(", ")}`);
  } catch (err) {
    console.warn(
      `[living-lot] could not ensure search attributes: ${err instanceof Error ? err.message : err}`,
    );
  } finally {
    await connection.close();
  }
}

async function run() {
  const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";

  await ensureSearchAttributes(address, namespace);

  const connection = await NativeConnection.connect({ address });

  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve("./workflows"),
    activities,
  });

  console.log(
    `[living-lot] worker online — namespace=${namespace} queue=${TASK_QUEUE} server=${address}`,
  );

  await worker.run();
  await connection.close();
}

run().catch((err) => {
  console.error("[living-lot] worker crashed:", err);
  process.exit(1);
});
