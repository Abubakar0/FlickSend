import { NextResponse } from "next/server";
import {
  PersistenceAccessDeniedError,
  PersistenceUnavailableError
} from "../../../persistence/account";
import { PersistentPeopleError, PersistentPeopleService } from "../../../persistence/people";
import { currentPersistentAccount } from "../../../persistence/request-account";

export const dynamic = "force-dynamic";

type PeopleOperation = "ACCEPT" | "BLOCK" | "DECLINE" | "REMOVE" | "UNBLOCK";

function unavailable(status = 503) {
  return NextResponse.json({ error: "PEOPLE_SERVICE_UNAVAILABLE", ok: false }, { status });
}

function failure(error: unknown) {
  if (error instanceof PersistenceAccessDeniedError) return unavailable(404);
  if (error instanceof PersistentPeopleError)
    return NextResponse.json({ error: error.code, ok: false }, { status: 400 });
  if (error instanceof PersistenceUnavailableError) return unavailable();
  return unavailable();
}

export async function GET() {
  try {
    const account = await currentPersistentAccount();
    const snapshot = await new PersistentPeopleService().load(account);
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  let body: { operation?: PeopleOperation; targetPersonId?: string };
  try {
    body = (await request.json()) as { operation?: PeopleOperation; targetPersonId?: string };
  } catch {
    return unavailable(400);
  }
  if (!body.operation || typeof body.targetPersonId !== "string") return unavailable(400);

  try {
    const account = await currentPersistentAccount();
    const people = new PersistentPeopleService();
    const snapshot =
      body.operation === "ACCEPT"
        ? await people.accept(account, body.targetPersonId)
        : body.operation === "BLOCK"
          ? await people.block(account, body.targetPersonId)
          : body.operation === "DECLINE"
            ? await people.decline(account, body.targetPersonId)
            : body.operation === "REMOVE"
              ? await people.remove(account, body.targetPersonId)
              : await people.unblock(account, body.targetPersonId);
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return failure(error);
  }
}
