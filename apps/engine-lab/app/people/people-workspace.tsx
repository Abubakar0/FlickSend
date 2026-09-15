"use client";

import {
  AppShell,
  Badge,
  Button,
  Card,
  Cluster,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorCallout,
  Heading,
  Icon,
  IconButton,
  Inline,
  Input,
  Page,
  PageHeader,
  PersonRow,
  Stack,
  Text,
  ThemeControl,
  useTheme
} from "@flicksend/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { connectedPeople } from "./people-state";
import { usePeople } from "./people-provider";
import type { PersonRelationship } from "./people-types";
import { ProductionInvitationPanel } from "./production-invitation-panel";
import "./people.css";

function ThemeUtility() {
  const theme = useTheme();
  return <ThemeControl preference={theme.preference} onPreferenceChange={theme.setPreference} />;
}

function relationshipLabel(relationship: PersonRelationship): string {
  switch (relationship.state) {
    case "CONNECTED":
      return "Connected";
    case "INVITED_INCOMING":
      return "Wants to connect";
    case "INVITED_OUTGOING":
      return "Invitation sent";
    case "BLOCKED":
      return "Blocked";
  }
}

export function PeopleWorkspace() {
  const { controller, mode, snapshot } = usePeople();
  const router = useRouter();
  const [pairingCode, setPairingCode] = useState("");
  const connected = connectedPeople(snapshot);
  const incoming = snapshot.relationships.filter(
    (relationship) => relationship.state === "INVITED_INCOMING"
  );
  const outgoing = snapshot.relationships.filter(
    (relationship) => relationship.state === "INVITED_OUTGOING"
  );
  const blocked = snapshot.relationships.filter((relationship) => relationship.state === "BLOCKED");
  const busy = snapshot.operation !== null;

  const sendTo = (personId: string) => {
    router.push(`/send?person=${encodeURIComponent(personId)}`);
  };

  return (
    <AppShell
      activeId="people"
      navigation={[
        { href: "/send", id: "send", label: "Send" },
        { href: "/people", id: "people", label: "People" }
      ]}
      utility={<ThemeUtility />}
    >
      <Page className="p6-people-page">
        <div aria-atomic="true" aria-live="polite" className="p6-sr-status">
          {snapshot.error?.title ?? (busy ? "Updating People." : "")}
        </div>
        <PageHeader
          actions={
            mode === "development" ? (
              <Dialog
                description="Share a short-lived development code or enter one from another person."
                title="Connect with someone"
                trigger={<Button id="p6-connect-trigger">Connect with someone</Button>}
              >
                <Stack gap="md">
                  <Text as="p" size="small" tone="secondary">
                    P6 DEVELOPMENT PAIRING MECHANISM. This is not production invitation security.
                  </Text>
                  {snapshot.inviteCode ? (
                    <Card className="p6-pairing-code" data-testid="people-pairing-code">
                      <Stack gap="xs">
                        <Text as="p" size="label" tone="muted">
                          Development pairing code
                        </Text>
                        <code>{snapshot.inviteCode}</code>
                        <Text as="p" size="small" tone="secondary">
                          This opaque code is short-lived and disappears after it is used.
                        </Text>
                      </Stack>
                    </Card>
                  ) : (
                    <Button disabled={busy} onClick={() => void controller.createInvite()}>
                      Create development pairing code
                    </Button>
                  )}
                  <label className="p6-pairing-input" htmlFor="p6-pairing-input">
                    <Text as="span" size="label">
                      Enter invite code
                    </Text>
                    <Input
                      id="p6-pairing-input"
                      onChange={(event) => setPairingCode(event.target.value)}
                      placeholder="fp-..."
                      value={pairingCode}
                    />
                  </label>
                  <Button
                    disabled={busy || pairingCode.trim().length === 0}
                    onClick={() => {
                      void controller.redeemInvite(pairingCode);
                      setPairingCode("");
                    }}
                    variant="secondary"
                  >
                    Use pairing code
                  </Button>
                </Stack>
              </Dialog>
            ) : mode === "persistent" ? (
              <ProductionInvitationPanel />
            ) : null
          }
          eyebrow="FlickSend"
        >
          <Heading as="h1" size="page">
            People
          </Heading>
          <Text tone="secondary">
            Keep the people you trust close when you&apos;re ready to send again.
          </Text>
        </PageHeader>

        {snapshot.error ? <ErrorCallout error={snapshot.error} /> : null}

        <Stack gap="lg">
          {incoming.length > 0 ? (
            <section aria-labelledby="p6-invitations-title">
              <Stack gap="sm">
                <div>
                  <Text as="p" size="label" tone="muted">
                    Invitations
                  </Text>
                  <Heading as="h2" id="p6-invitations-title" size="section">
                    Waiting for you
                  </Heading>
                </div>
                {incoming.map((relationship) => (
                  <Card
                    className="p6-person-card"
                    data-testid={`people-incoming-${relationship.person.id}`}
                    key={relationship.person.id}
                  >
                    <PersonRow
                      action={
                        <Cluster>
                          <Button
                            aria-label={`Accept invitation from ${relationship.person.displayName}`}
                            disabled={busy}
                            onClick={() => void controller.accept(relationship.person.id)}
                            size="sm"
                          >
                            Accept
                          </Button>
                          <Button
                            aria-label={`Decline invitation from ${relationship.person.displayName}`}
                            disabled={busy}
                            onClick={() => void controller.decline(relationship.person.id)}
                            size="sm"
                            variant="secondary"
                          >
                            Decline
                          </Button>
                        </Cluster>
                      }
                      person={{
                        name: relationship.person.displayName,
                        presence: relationship.person.presence,
                        subtitle: `${relationship.person.displayName} wants to connect`
                      }}
                    />
                  </Card>
                ))}
              </Stack>
            </section>
          ) : null}

          <section aria-labelledby="p6-connected-title">
            <Stack gap="sm">
              <div>
                <Text as="p" size="label" tone="muted">
                  Connected
                </Text>
                <Heading as="h2" id="p6-connected-title" size="section">
                  Your people
                </Heading>
              </div>
              {connected.length === 0 && !snapshot.isLoading ? (
                <EmptyState
                  description={
                    mode === "development"
                      ? "Connect with someone to make sending faster next time."
                      : "Connections will appear here when they are established through FlickSend."
                  }
                  title="No people yet"
                />
              ) : (
                connected.map((relationship) => (
                  <Card
                    className="p6-person-card"
                    data-testid={`people-connected-${relationship.person.id}`}
                    key={relationship.person.id}
                  >
                    <PersonRow
                      action={
                        <Inline>
                          <Button
                            aria-label={`Send to ${relationship.person.displayName}`}
                            onClick={() => sendTo(relationship.person.id)}
                            size="sm"
                          >
                            Send
                          </Button>
                          <Dialog
                            description={`Manage your connection with ${relationship.person.displayName}.`}
                            title={relationship.person.displayName}
                            trigger={
                              <IconButton aria-label={`Manage ${relationship.person.displayName}`}>
                                <Icon name="more" />
                              </IconButton>
                            }
                          >
                            <Stack gap="sm">
                              <Badge tone="success">Connected</Badge>
                              <Text as="p" tone="secondary">
                                Connected. Changes only affect future People actions, not an active
                                transfer.
                              </Text>
                              <ConfirmDialog
                                actionLabel={`Remove ${relationship.person.displayName}`}
                                description="This removes the connection. It does not delete transfer history."
                                onConfirm={() => void controller.remove(relationship.person.id)}
                                title={`Remove ${relationship.person.displayName}?`}
                                trigger={
                                  <Button disabled={busy} variant="secondary">
                                    Remove connection
                                  </Button>
                                }
                              >
                                <Text as="p">
                                  You can connect again later with a new{" "}
                                  {mode === "development" ? "pairing code" : "invitation"}.
                                </Text>
                              </ConfirmDialog>
                              <ConfirmDialog
                                actionLabel={`Block ${relationship.person.displayName}`}
                                description="Blocking ends this connection and prevents future pairing and normal Send selection."
                                onConfirm={() => void controller.block(relationship.person.id)}
                                title={`Block ${relationship.person.displayName}?`}
                                trigger={
                                  <Button disabled={busy} variant="danger">
                                    Block person
                                  </Button>
                                }
                              >
                                <Text as="p">
                                  This does not silently cancel an already active transfer.
                                </Text>
                              </ConfirmDialog>
                            </Stack>
                          </Dialog>
                        </Inline>
                      }
                      person={{
                        name: relationship.person.displayName,
                        presence: relationship.person.presence,
                        subtitle: relationshipLabel(relationship)
                      }}
                    />
                  </Card>
                ))
              )}
            </Stack>
          </section>

          {outgoing.length > 0 ? (
            <section aria-labelledby="p6-outgoing-title">
              <Stack gap="sm">
                <div>
                  <Text as="p" size="label" tone="muted">
                    Invitations
                  </Text>
                  <Heading as="h2" id="p6-outgoing-title" size="section">
                    Invitation sent
                  </Heading>
                </div>
                {outgoing.map((relationship) => (
                  <Card
                    className="p6-person-card"
                    data-testid={`people-outgoing-${relationship.person.id}`}
                    key={relationship.person.id}
                  >
                    <PersonRow
                      action={<Badge tone="info">Invitation sent</Badge>}
                      person={{
                        name: relationship.person.displayName,
                        presence: relationship.person.presence,
                        subtitle: relationshipLabel(relationship)
                      }}
                    />
                  </Card>
                ))}
              </Stack>
            </section>
          ) : null}

          {blocked.length > 0 ? (
            <section aria-labelledby="p6-blocked-title">
              <Stack gap="sm">
                <div>
                  <Text as="p" size="label" tone="muted">
                    Manage
                  </Text>
                  <Heading as="h2" id="p6-blocked-title" size="section">
                    Blocked people
                  </Heading>
                </div>
                {blocked.map((relationship) => (
                  <Card
                    className="p6-person-card"
                    data-testid={`people-blocked-${relationship.person.id}`}
                    key={relationship.person.id}
                  >
                    <PersonRow
                      action={
                        <Button
                          aria-label={`Unblock ${relationship.person.displayName}`}
                          disabled={busy}
                          onClick={() => void controller.unblock(relationship.person.id)}
                          size="sm"
                          variant="secondary"
                        >
                          Unblock
                        </Button>
                      }
                      person={{
                        name: relationship.person.displayName,
                        presence: relationship.person.presence,
                        subtitle: relationshipLabel(relationship)
                      }}
                    />
                  </Card>
                ))}
              </Stack>
            </section>
          ) : null}
        </Stack>
      </Page>
    </AppShell>
  );
}
