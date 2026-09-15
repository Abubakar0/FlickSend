import { NextResponse } from "next/server";
import {
  PersistenceAccessDeniedError,
  PersistenceUnavailableError
} from "../../persistence/account";
import { PersistentInvitationService } from "../../persistence/invitations";
import { currentPersistentAccount } from "../../persistence/request-account";

export const dynamic = "force-dynamic";

function unavailable(status = 503) {
  return NextResponse.json({ error: "INVITATION_SERVICE_UNAVAILABLE", ok: false }, { status });
}

function failure(error: unknown) {
  if (error instanceof PersistenceAccessDeniedError) return unavailable(404);
  if (error instanceof PersistenceUnavailableError) return unavailable();
  return unavailable();
}

export async function GET() {
  try {
    const account = await currentPersistentAccount();
    const invitations = await new PersistentInvitationService().list(account);
    return NextResponse.json({ invitations, ok: true });
  } catch (error) {
    return failure(error);
  }
}

export async function POST() {
  try {
    const account = await currentPersistentAccount();
    const invitation = await new PersistentInvitationService().create(account);
    return NextResponse.json({ invitation, ok: true }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
