"use client";

import { Page, Stack, Text } from "@flicksend/ui";
import { AuthView } from "./auth-views";

export function AuthPage({
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
  return (
    <Page className="p10-auth-page">
      <Stack gap="lg">
        <Text as="p" size="label" tone="muted">
          FlickSend account
        </Text>
        <AuthView
          configured={configured}
          fixtureEnabled={fixtureEnabled}
          mode={mode}
          returnTo={returnTo}
        />
      </Stack>
    </Page>
  );
}
