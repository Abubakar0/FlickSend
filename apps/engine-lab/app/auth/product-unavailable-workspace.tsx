"use client";

import {
  AppShell,
  Card,
  Heading,
  Page,
  PageHeader,
  Stack,
  Text,
  ThemeControl,
  useTheme
} from "@flicksend/ui";
import { useCurrentAccount } from "./current-account-provider";

function ThemeUtility() {
  const theme = useTheme();
  return <ThemeControl preference={theme.preference} onPreferenceChange={theme.setPreference} />;
}

const copy = {
  people: {
    detail:
      "Signing in does not create a People relationship graph. Persistent People data is deferred.",
    title: "People is not available yet"
  },
  send: {
    detail:
      "Sending requires an eligible recipient. Persistent People relationships are not available yet.",
    title: "Send is not available yet"
  },
  transfers: {
    detail:
      "Signing in does not make transfer history durable. Persistent transfer records are deferred.",
    title: "Transfers is not available yet"
  }
} as const;

export function ProductUnavailableWorkspace({ area }: { area: keyof typeof copy }) {
  const principal = useCurrentAccount();
  const content = copy[area];
  return (
    <AppShell
      activeId={area}
      navigation={[
        { href: "/send", id: "send", label: "Send" },
        { href: "/people", id: "people", label: "People" },
        { href: "/transfers", id: "transfers", label: "Transfers" },
        { href: "/account", id: "account", label: "Account" }
      ]}
      utility={<ThemeUtility />}
    >
      <Page className="p10-account-page">
        <PageHeader eyebrow="FlickSend account">
          <Heading as="h1" size="page">
            {content.title}
          </Heading>
          <Text tone="secondary">Signed in as {principal?.displayName ?? "your account"}.</Text>
        </PageHeader>
        <Card className="p10-account-card">
          <Stack gap="sm">
            <Text>{content.detail}</Text>
            <Text size="small" tone="secondary">
              Account sign-in does not change transfer authorization, integrity, delivery, or
              recovery.
            </Text>
          </Stack>
        </Card>
      </Page>
    </AppShell>
  );
}
