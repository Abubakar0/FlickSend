import { NextResponse } from "next/server";
import { PersistenceAccessDeniedError, PersistenceUnavailableError } from "../../../persistence/account";
import {
  PersistentTransfersError,
  PersistentTransfersService
} from "../../../persistence/transfers";
import { currentPersistentAccount } from "../../../persistence/request-account";
import type { TransferLifecycleEvent } from "../../../transfers/transfer-types";

export const dynamic = "force-dynamic";

function unavailable(status = 503) {
  return NextResponse.json({ error: "TRANSFERS_SERVICE_UNAVAILABLE", ok: false }, { status });
}

function failure(error: unknown) {
  if (error instanceof PersistenceAccessDeniedError) return unavailable(404);
  if (error instanceof PersistentTransfersError)
    return NextResponse.json({ error: error.code, ok: false }, { status: 400 });
  if (error instanceof PersistenceUnavailableError) return unavailable();
  return unavailable();
}

export async function GET(request: Request) {
  try {
    const account = await currentPersistentAccount();
    const record = new URL(request.url).searchParams.get("record");
    const transfers = new PersistentTransfersService();
    if (record) return NextResponse.json({ ok: true, record: await transfers.get(account, record) });
    return NextResponse.json({ ok: true, records: await transfers.list(account) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  let body: { event?: TransferLifecycleEvent; operation?: string };
  try {
    body = (await request.json()) as { event?: TransferLifecycleEvent; operation?: string };
  } catch {
    return unavailable(400);
  }
  if (body.operation !== "RECORD" || !body.event) return unavailable(400);

  try {
    const account = await currentPersistentAccount();
    const record = await new PersistentTransfersService().record(account, body.event);
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    return failure(error);
  }
}
