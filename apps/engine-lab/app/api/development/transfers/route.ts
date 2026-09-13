import { NextResponse } from "next/server";
import { isDevelopmentAuthFixtureEnabled } from "../../../auth/config";
import {
  DevelopmentTransferStoreError,
  developmentTransferStore
} from "../../../transfers/development-transfer-store";
import type { TransferLifecycleEvent } from "../../../transfers/transfer-types";

export const dynamic = "force-dynamic";

type RequestBody =
  { operation: "RECORD"; person?: string; event?: TransferLifecycleEvent } | { operation: "RESET" };

function unavailable() {
  return NextResponse.json({ error: "TRANSFERS_SERVICE_UNAVAILABLE", ok: false }, { status: 503 });
}

function failure(error: unknown) {
  const code =
    error instanceof DevelopmentTransferStoreError ? error.code : "TRANSFERS_SERVICE_UNAVAILABLE";
  return NextResponse.json(
    { error: code, ok: false },
    { status: code === "TRANSFERS_NOT_FOUND" ? 404 : 400 }
  );
}

export async function GET(request: Request) {
  if (!isDevelopmentAuthFixtureEnabled()) return new NextResponse(null, { status: 404 });
  const url = new URL(request.url);
  const person = url.searchParams.get("person") ?? "";
  const record = url.searchParams.get("record");
  try {
    const store = developmentTransferStore();
    if (record) return NextResponse.json({ ok: true, record: store.get(person, record) });
    return NextResponse.json({ ok: true, records: store.list(person) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  if (!isDevelopmentAuthFixtureEnabled()) return new NextResponse(null, { status: 404 });
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return unavailable();
  }
  try {
    const store = developmentTransferStore();
    if (body.operation === "RESET") {
      store.reset();
      return NextResponse.json({ ok: true });
    }
    if (body.operation === "RECORD" && body.person && body.event)
      return NextResponse.json({ ok: true, record: store.record(body.person, body.event) });
    return unavailable();
  } catch (error) {
    return failure(error);
  }
}
