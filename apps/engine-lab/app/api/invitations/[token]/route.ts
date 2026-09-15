import { NextResponse } from "next/server";
import {
  PersistenceAccessDeniedError,
  PersistenceUnavailableError
} from "../../../persistence/account";
import { InvitationError, PersistentInvitationService } from "../../../persistence/invitations";
import { currentPersistentAccount } from "../../../persistence/request-account";

export const dynamic = "force-dynamic";

function unavailable(status = 400) {
  return NextResponse.json({ error: "INVITATION_UNAVAILABLE", ok: false }, { status });
}

function failure(error: unknown) {
  if (error instanceof InvitationError || error instanceof PersistenceAccessDeniedError)
    return unavailable();
  if (error instanceof PersistenceUnavailableError) return unavailable(503);
  return unavailable(503);
}

async function action(request: Request): Promise<"ACCEPT" | "DECLINE" | null> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 128) return null;
  try {
    const value = JSON.parse(text) as { action?: unknown };
    return value.action === "ACCEPT" || value.action === "DECLINE" ? value.action : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const requestedAction = await action(request);
  if (!requestedAction) return unavailable();
  try {
    const [{ token }, account] = await Promise.all([params, currentPersistentAccount()]);
    const invitations = new PersistentInvitationService();
    const result =
      requestedAction === "ACCEPT"
        ? await invitations.accept(account, token)
        : await invitations.decline(account, token);
    return NextResponse.json({ ok: true, result: result ?? "DECLINED" });
  } catch (error) {
    return failure(error);
  }
}

/** The route parameter is an opaque public invitation ID for revocation, never a database ID. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const [{ token: publicId }, account] = await Promise.all([params, currentPersistentAccount()]);
    await new PersistentInvitationService().revoke(account, publicId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InvitationError || error instanceof PersistenceAccessDeniedError)
      return unavailable();
    if (error instanceof PersistenceUnavailableError) return unavailable(503);
    return unavailable(503);
  }
}
