import { NextResponse } from "next/server";
import {
  PersistenceAccessDeniedError,
  PersistenceUnavailableError
} from "../../../../persistence/account";
import { currentPersistentAccount } from "../../../../persistence/request-account";
import {
  SignalSessionAuthorizationError,
  ProductionSignalSessionService
} from "../../../../signaling/session-service";
import { SignalingInfrastructureUnavailableError } from "../../../../signaling/capabilities.server";

export const dynamic = "force-dynamic";

function unavailable(status = 503) {
  return NextResponse.json({ error: "SIGNALING_UNAVAILABLE", ok: false }, { status });
}

async function recipientId(request: Request): Promise<string | null> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 256) return null;
  try {
    const value = JSON.parse(text) as { recipientId?: unknown };
    return typeof value.recipientId === "string" ? value.recipientId : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const recipient = await recipientId(request);
  if (!recipient) return unavailable(400);
  try {
    const account = await currentPersistentAccount();
    const session = await new ProductionSignalSessionService().createForConnectedRecipient(
      account,
      recipient
    );
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    if (
      error instanceof PersistenceAccessDeniedError ||
      error instanceof SignalSessionAuthorizationError
    )
      return unavailable(404);
    if (
      error instanceof PersistenceUnavailableError ||
      error instanceof SignalingInfrastructureUnavailableError
    )
      return unavailable();
    return unavailable();
  }
}
