"use client";

import { AppShell, Card, Heading, Inline, Page, PageHeader, Stack, Text } from "@flicksend/ui";
import { useCurrentAccount } from "./current-account-provider";
import { SignOutAction } from "./sign-out-action";

const copy = {
  account: { title: "Account is temporarily unavailable" },
  people: { title: "People is temporarily unavailable" },
  send: { title: "Send is temporarily unavailable" },
  transfers: { title: "Transfers are temporarily unavailable" }
} as const;

/** Safe product state for an unavailable PostgreSQL control plane; it never falls back to fixture data. */
export function PersistenceUnavailableWorkspace({ area }: { area: keyof typeof copy }) {
  const principal = useCurrentAccount();
  return (
    <AppShell
      activeId={area}
      navigation={[
        { href: "/send", id: "send", label: "Send" },
        { href: "/people", id: "people", label: "People" },
        { href: "/transfers", id: "transfers", label: "Transfers" },
        { href: "/account", id: "account", label: "Account" }
      ]}
    >
      <Page className="p10-account-page">
        <PageHeader eyebrow="FlickSend account">
          <Heading as="h1" size="page">
            {copy[area].title}
          </Heading>
          <Text tone="secondary">Signed in as {principal?.displayName ?? "your account"}.</Text>
        </PageHeader>
        <Card className="p10-account-card" role="status">
          <Stack gap="sm">
            <Text>
              FlickSend&apos;s account data could not be reached right now. Try again shortly.
            </Text>
            <Text size="small" tone="secondary">
              Existing transfer correctness, verified progress, and guest authorization are
              unaffected.
            </Text>
            {area === "account" ? (
              <Inline>
                <SignOutAction fixture={false} />
              </Inline>
            ) : null}
          </Stack>
        </Card>
      </Page>
    </AppShell>
  );
}
