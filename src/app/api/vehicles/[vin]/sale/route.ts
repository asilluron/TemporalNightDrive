import { NextResponse } from "next/server";
import { getTemporalClient } from "@/lib/temporal/client";
import { rejectionReason } from "@/lib/sale-error";
import type { SaleInput, SaleResult } from "@/temporal/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Request a sale via the requestSale Update. The Workflow's validator is the
// consistency boundary: it rejects the sale at the door (recall / not on lot /
// below floor) before anything is recorded, surfaced here as a 422.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ vin: string }> },
) {
  const { vin } = await params;
  const body = (await req.json().catch(() => ({}))) as Partial<SaleInput>;
  const input: SaleInput = {
    buyer: body.buyer ?? "Anonymous",
    salePrice: Number(body.salePrice ?? 0),
    financed: Boolean(body.financed),
  };

  try {
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(vin);
    const result = await handle.executeUpdate<SaleResult, [SaleInput]>("requestSale", {
      args: [input],
    });
    return NextResponse.json(result);
  } catch (err) {
    // A rejected Update throws WorkflowUpdateFailedError; rejectionReason walks
    // the cause chain so the dashboard shows why the car refused the sale.
    return NextResponse.json({ error: rejectionReason(err) }, { status: 422 });
  }
}
