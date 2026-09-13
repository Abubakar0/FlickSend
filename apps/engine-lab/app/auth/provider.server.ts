import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { hasClerkConfiguration } from "./config";
import { developmentFixtureSession } from "./development-fixture";
import { signInPath } from "./safe-return-path";
import type { AuthFixtureRequest, AuthPrincipal, AuthSession } from "./types";

function unavailableSession(): AuthSession {
  return {
    fixturePersonId: null,
    principal: null,
    source: "unavailable",
    state: "CONFIGURATION_UNAVAILABLE"
  };
}

function signedOutSession(): AuthSession {
  return { fixturePersonId: null, principal: null, source: "clerk", state: "SIGNED_OUT" };
}

function displayNameFor(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.username || null;
}

function principalFor(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>): AuthPrincipal {
  const email = user.primaryEmailAddress;
  return {
    displayName: displayNameFor(user),
    emailVerified: email ? email.verification?.status === "verified" : null,
    primaryEmail: email?.emailAddress ?? null,
    principalId: user.id
  };
}

/** Resolves server authority once at the application boundary, never from UI input. */
export async function getOptionalAuthenticatedPrincipal(
  fixtureRequest: AuthFixtureRequest = {}
): Promise<AuthSession> {
  if (!hasClerkConfiguration())
    return developmentFixtureSession(fixtureRequest) ?? unavailableSession();
  try {
    const session = await auth();
    if (!session.userId) return signedOutSession();
    const user = await currentUser();
    return user
      ? {
          fixturePersonId: null,
          principal: principalFor(user),
          source: "clerk",
          state: "SIGNED_IN"
        }
      : signedOutSession();
  } catch {
    // Provider details must not become normal product errors or diagnostics.
    return signedOutSession();
  }
}

/** Redirects unauthenticated product requests before protected UI can render. */
export async function requireAuthenticatedPrincipal(
  returnTo: string,
  fixtureRequest: AuthFixtureRequest = {}
): Promise<AuthSession> {
  const session = await getOptionalAuthenticatedPrincipal(fixtureRequest);
  if (session.state === "SIGNED_OUT") {
    const fixtureSuffix = session.source === "development-fixture" ? "&fixture=signed-out" : "";
    redirect(`${signInPath(returnTo)}${fixtureSuffix}`);
  }
  return session;
}
