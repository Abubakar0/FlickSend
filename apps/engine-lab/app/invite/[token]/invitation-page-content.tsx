"use client";

import { Card, Heading, Inline, Page, Stack, Text } from "@flicksend/ui";
import { InvitationResponse } from "./invitation-response";

type InvitationPagePresentation =
  | { state: "UNAVAILABLE" }
  | { signInHref: string; state: "SIGN_IN_REQUIRED" }
  | { state: "READY"; token: string };

/** Presentation-only client boundary; server authorization and token inspection remain in page.tsx. */
export function InvitationPageContent(presentation: InvitationPagePresentation) {
  if (presentation.state === "UNAVAILABLE")
    return (
      <Page className="p6-people-page">
        <Card className="p10-account-card" role="status">
          <Stack gap="sm">
            <Heading as="h1" size="page">
              That invitation isn&apos;t available
            </Heading>
            <Text tone="secondary">
              Ask the person who shared it to create a new invitation link.
            </Text>
          </Stack>
        </Card>
      </Page>
    );

  if (presentation.state === "SIGN_IN_REQUIRED")
    return (
      <Page className="p6-people-page">
        <Card className="p10-account-card">
          <Stack gap="md">
            <Heading as="h1" size="page">
              A FlickSend invitation is waiting
            </Heading>
            <Text tone="secondary">Sign in or create an account to respond to it.</Text>
            <Inline>
              <a
                className="fs-button fs-button--primary fs-button--md"
                href={presentation.signInHref}
              >
                Sign in to respond
              </a>
            </Inline>
          </Stack>
        </Card>
      </Page>
    );

  return (
    <Page className="p6-people-page">
      <InvitationResponse token={presentation.token} />
    </Page>
  );
}
