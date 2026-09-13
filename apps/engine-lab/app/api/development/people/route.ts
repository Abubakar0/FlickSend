import { NextResponse } from "next/server";
import { isDevelopmentAuthFixtureEnabled } from "../../../auth/config";
import {
  DevelopmentPeopleError,
  developmentPeopleStore,
  type DevelopmentPeopleMutationResult
} from "../../../people/development-people-store";

export const dynamic = "force-dynamic";

type RequestBody = {
  clientId?: string;
  code?: string;
  operation?:
    | "ACCEPT"
    | "BLOCK"
    | "CREATE_INVITE"
    | "DECLINE"
    | "LOAD"
    | "REDEEM_INVITE"
    | "REMOVE"
    | "RESET"
    | "UNBLOCK";
  personId?: string;
  revision?: number;
  targetPersonId?: string;
};

function response(result: DevelopmentPeopleMutationResult) {
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  if (!isDevelopmentAuthFixtureEnabled()) return new NextResponse(null, { status: 404 });
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "PEOPLE_INVITE_INVALID" }, { status: 400 });
  }
  const personId = body.personId ?? "";
  const store = developmentPeopleStore();
  try {
    if (body.operation === "RESET") {
      store.reset();
      return response({ snapshot: store.snapshot(personId) });
    }
    if (!body.operation || body.operation === "LOAD")
      return response({ snapshot: store.snapshot(personId) });
    const revision = body.revision;
    if (
      !body.clientId ||
      typeof revision !== "number" ||
      !Number.isInteger(revision) ||
      !store.acceptsClientRevision(body.clientId, revision)
    )
      return response({ snapshot: store.snapshot(personId), stale: true });

    switch (body.operation) {
      case "CREATE_INVITE":
        return response(store.createPairingCode(personId));
      case "REDEEM_INVITE":
        return response(store.redeemPairingCode(personId, body.code ?? ""));
      case "ACCEPT":
        return response(store.accept(personId, body.targetPersonId ?? ""));
      case "DECLINE":
        return response(store.decline(personId, body.targetPersonId ?? ""));
      case "REMOVE":
        return response(store.remove(personId, body.targetPersonId ?? ""));
      case "BLOCK":
        return response(store.block(personId, body.targetPersonId ?? ""));
      case "UNBLOCK":
        return response(store.unblock(personId, body.targetPersonId ?? ""));
      default:
        return NextResponse.json({ ok: false, error: "PEOPLE_INVITE_INVALID" }, { status: 400 });
    }
  } catch (error) {
    const code =
      error instanceof DevelopmentPeopleError ? error.code : "PEOPLE_SERVICE_UNAVAILABLE";
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
