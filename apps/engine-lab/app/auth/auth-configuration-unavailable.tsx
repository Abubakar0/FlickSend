"use client";

import { Card, Heading, Page, Stack, Text } from "@flicksend/ui";

/** Safe server-rendered state when an account-owned route has no auth provider configuration. */
export function AuthConfigurationUnavailable() {
  return (
    <Page className="p10-auth-page">
      <Card className="p10-auth-card" role="status">
        <Stack gap="sm">
          <Heading as="h1" size="page">
            Account access is not available
          </Heading>
          <Text tone="secondary">We couldn't sign you in right now. Try again shortly.</Text>
        </Stack>
      </Card>
    </Page>
  );
}
