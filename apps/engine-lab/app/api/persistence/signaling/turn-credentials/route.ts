import { NextResponse } from "next/server";
import {
  TurnCredentialService,
  TurnCredentialServiceError,
  type TurnCredentialIssueInput
} from "../../../../signaling/turn-credentials.server";

export const dynamic = "force-dynamic";

const maximumRequestBytes = 2_048;

export async function POST(request: Request) {
  const input = await parseIssueInput(request);
  if (!input) return safeError("FS_TURN_AUTH_FAILED", 400);
  try {
    const configuration = await new TurnCredentialService().issue(input);
    return NextResponse.json({ configuration, ok: true });
  } catch (error) {
    if (error instanceof TurnCredentialServiceError) return safeError(error.code, statusFor(error.code));
    return safeError("FS_TURN_CREDENTIAL_UNAVAILABLE", 503);
  }
}

async function parseIssueInput(request: Request): Promise<TurnCredentialIssueInput | null> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumRequestBytes) return null;
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => key !== "capability" && key !== "renewal") ||
    typeof input.capability !== "string" ||
    input.capability.length === 0 ||
    input.capability.length > 1_536 ||
    (input.renewal !== undefined && typeof input.renewal !== "boolean")
  ) {
    return null;
  }
  return { capability: input.capability, renewal: input.renewal as boolean | undefined };
}

function statusFor(code: TurnCredentialServiceError["code"]): 403 | 429 | 503 {
  if (code === "FS_TURN_AUTH_FAILED") return 403;
  if (code === "FS_TURN_RATE_LIMITED") return 429;
  return 503;
}

function safeError(code: TurnCredentialServiceError["code"], status: 400 | 403 | 429 | 503) {
  return NextResponse.json({ error: code, ok: false }, { status });
}
