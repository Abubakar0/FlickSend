"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { Card, Heading, Inline, Stack, Text } from "@flicksend/ui";
import { safeReturnPath } from "./safe-return-path";

function FixtureAuthView({ mode, returnTo }: { mode: "sign-in" | "sign-up"; returnTo: string }) {
  const destination = safeReturnPath(returnTo);
  const label = mode === "sign-in" ? "Sign in" : "Create account";
  return (
    <Card className="p10-auth-card">
      <Stack gap="md">
        <Heading as="h1" size="page">
          {label}
        </Heading>
        <Text tone="secondary">P10 DEVELOPMENT AUTH FIXTURE NOT PRODUCTION AUTHENTICATION.</Text>
        <Text tone="secondary">
          Deterministic Engine Lab qualification uses a synthetic identity only while its explicit
          test switch is enabled.
        </Text>
        <Inline gap="sm">
          <a
            className="fs-button fs-button--primary fs-button--md"
            href={`${destination}${destination.includes("?") ? "&" : "?"}as=dev-sender`}
          >
            Continue as development sender
          </a>
          <a className="fs-link" href={mode === "sign-in" ? "/sign-up" : "/sign-in"}>
            {mode === "sign-in" ? "Create account" : "Sign in"}
          </a>
        </Inline>
      </Stack>
    </Card>
  );
}

function ConfigurationUnavailable({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <Card className="p10-auth-card" role="status">
      <Stack gap="sm">
        <Heading as="h1" size="page">
          {mode === "sign-in" ? "Sign in is not available" : "Account creation is not available"}
        </Heading>
        <Text tone="secondary">We couldn't sign you in right now. Try again shortly.</Text>
      </Stack>
    </Card>
  );
}

export function AuthView({
  configured,
  fixtureEnabled,
  mode,
  returnTo
}: {
  configured: boolean;
  fixtureEnabled: boolean;
  mode: "sign-in" | "sign-up";
  returnTo: string;
}) {
  const destination = safeReturnPath(returnTo);
  if (configured) {
    return mode === "sign-in" ? (
      <SignIn
        forceRedirectUrl={destination}
        signUpUrl={`/sign-up?returnTo=${encodeURIComponent(destination)}`}
      />
    ) : (
      <SignUp
        forceRedirectUrl={destination}
        signInUrl={`/sign-in?returnTo=${encodeURIComponent(destination)}`}
      />
    );
  }
  if (fixtureEnabled) return <FixtureAuthView mode={mode} returnTo={destination} />;
  return <ConfigurationUnavailable mode={mode} />;
}
