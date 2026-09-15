"use client";

import { useState } from "react";
import { Button, Card, ErrorCallout, Heading, Inline, Stack, Text } from "@flicksend/ui";

type InvitationResponseState = "READY" | "ACCEPTED" | "DECLINED";

const unavailable = {
  code: "FS-PRODUCT-INVITATION-UNAVAILABLE",
  explanation: "This invitation may have expired, been used, or no longer be available.",
  kind: "action_required" as const,
  recommendedAction: "Ask for a new invitation link.",
  retryable: false,
  title: "That invitation isn't available"
};

/** Receives a bearer token only to submit the current user's authorized decision to the server. */
export function InvitationResponse({ token }: { token: string }) {
  const [error, setError] = useState<typeof unavailable | null>(null);
  const [state, setState] = useState<InvitationResponseState>("READY");
  const [submitting, setSubmitting] = useState(false);

  async function respond(action: "ACCEPT" | "DECLINE"): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/invitations/${encodeURIComponent(token)}`, {
        body: JSON.stringify({ action }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      if (!response.ok) throw new Error("unavailable");
      setState(action === "ACCEPT" ? "ACCEPTED" : "DECLINED");
    } catch {
      setError(unavailable);
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "ACCEPTED")
    return (
      <Card className="p10-account-card" role="status">
        <Stack gap="sm">
          <Heading as="h1" size="page">
            You&apos;re connected
          </Heading>
          <Text tone="secondary">This person is now in your People list for future sends.</Text>
          <Inline>
            <a className="fs-button fs-button--primary fs-button--md" href="/people">
              Go to People
            </a>
          </Inline>
        </Stack>
      </Card>
    );
  if (state === "DECLINED")
    return (
      <Card className="p10-account-card" role="status">
        <Stack gap="sm">
          <Heading as="h1" size="page">
            Invitation declined
          </Heading>
          <Text tone="secondary">No connection was created.</Text>
          <Inline>
            <a className="fs-link" href="/people">
              Go to People
            </a>
          </Inline>
        </Stack>
      </Card>
    );
  return (
    <Card className="p10-account-card">
      <Stack gap="md">
        <Heading as="h1" size="page">
          Connect on FlickSend
        </Heading>
        <Text tone="secondary">
          Accepting adds this person to People for future sends. It does not grant access to any
          existing transfer.
        </Text>
        {error ? <ErrorCallout error={error} /> : null}
        <Inline gap="sm">
          <Button disabled={submitting} onClick={() => void respond("ACCEPT")}>
            Accept invitation
          </Button>
          <Button disabled={submitting} onClick={() => void respond("DECLINE")} variant="secondary">
            Decline
          </Button>
        </Inline>
      </Stack>
    </Card>
  );
}
