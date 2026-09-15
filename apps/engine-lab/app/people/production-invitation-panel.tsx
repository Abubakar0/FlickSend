"use client";

import { useEffect, useState } from "react";
import { Button, Card, ConfirmDialog, Dialog, ErrorCallout, Stack, Text } from "@flicksend/ui";

type PendingInvitation = {
  expiresAt: string;
  publicId: string;
  status: "PENDING";
};

type ProductError = {
  code: string;
  explanation: string;
  kind: "action_required";
  recommendedAction: string;
  retryable: boolean;
  title: string;
};

const serviceError: ProductError = {
  code: "FS-PRODUCT-INVITATION-UNAVAILABLE",
  explanation: "An invitation could not be updated right now.",
  kind: "action_required",
  recommendedAction: "Try again shortly.",
  retryable: true,
  title: "FlickSend is temporarily unavailable"
};

function formatExpiry(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Expires soon" : `Expires ${date.toLocaleDateString()}`;
}

/** P12 presentation-only client for server-authorized, one-time share links. */
export function ProductionInvitationPanel() {
  const [createdPath, setCreatedPath] = useState<string | null>(null);
  const [error, setError] = useState<ProductError | null>(null);
  const [invitations, setInvitations] = useState<readonly PendingInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function load(): Promise<void> {
    try {
      const response = await fetch("/api/invitations", { cache: "no-store" });
      const body = (await response.json()) as
        { invitations: readonly PendingInvitation[]; ok: true } | { ok: false };
      if (!response.ok || !body.ok) throw new Error("unavailable");
      setInvitations(body.invitations);
    } catch {
      setError(serviceError);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/invitations", { method: "POST" });
      const body = (await response.json()) as
        { invitation: { path: string }; ok: true } | { ok: false };
      if (!response.ok || !body.ok) throw new Error("unavailable");
      setCreatedPath(body.invitation.path);
      await load();
    } catch {
      setError(serviceError);
    } finally {
      setLoading(false);
    }
  }

  async function copy(): Promise<void> {
    if (!createdPath || !navigator.clipboard) {
      setError(serviceError);
      return;
    }
    try {
      await navigator.clipboard.writeText(new URL(createdPath, window.location.origin).toString());
    } catch {
      setError(serviceError);
    }
  }

  async function revoke(publicId: string): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/invitations/${encodeURIComponent(publicId)}`, {
        method: "DELETE"
      });
      if (!response.ok) throw new Error("unavailable");
      await load();
    } catch {
      setError(serviceError);
    } finally {
      setLoading(false);
    }
  }

  function setInvitationDialogOpen(nextOpen: boolean): void {
    setOpen(nextOpen);
    if (!nextOpen) {
      // The raw bearer link is intentionally one-time display state, never a saved UI value.
      setCreatedPath(null);
      setError(null);
    }
  }

  return (
    <Dialog
      description="Create a private link for someone you want to connect with. It expires after seven days."
      onOpenChange={setInvitationDialogOpen}
      open={open}
      title="Invite someone"
      trigger={<Button id="p12-invite-trigger">Invite someone</Button>}
    >
      <Stack gap="md">
        {error ? <ErrorCallout error={error} /> : null}
        {createdPath ? (
          <Card className="p6-pairing-code">
            <Stack gap="sm">
              <Text as="p" size="label" tone="muted">
                Invitation link ready
              </Text>
              <Text as="p" size="small" tone="secondary">
                Share it only with the person you want to connect with. FlickSend will not show it
                again after this dialog closes.
              </Text>
              <Button disabled={loading} onClick={() => void copy()}>
                Copy invitation link
              </Button>
            </Stack>
          </Card>
        ) : (
          <Button disabled={loading} onClick={() => void create()}>
            Create invitation link
          </Button>
        )}
        {invitations.length ? (
          <Stack gap="sm">
            <Text as="p" size="label" tone="muted">
              Active invitations
            </Text>
            {invitations.map((invitation) => (
              <Card className="p6-person-card" key={invitation.publicId}>
                <Stack gap="sm">
                  <Text as="p">Invitation ready</Text>
                  <Text as="p" size="small" tone="secondary">
                    {formatExpiry(invitation.expiresAt)}
                  </Text>
                  <ConfirmDialog
                    actionLabel="Revoke invitation"
                    description="This link will stop working immediately."
                    onConfirm={() => void revoke(invitation.publicId)}
                    title="Revoke this invitation?"
                    trigger={
                      <Button disabled={loading} size="sm" variant="secondary">
                        Revoke
                      </Button>
                    }
                  >
                    <Text as="p">
                      Anyone who opens this link after revocation will see it is unavailable.
                    </Text>
                  </ConfirmDialog>
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Dialog>
  );
}
