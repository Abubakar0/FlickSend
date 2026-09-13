"use client";

import {
  AppShell,
  Card,
  Heading,
  Inline,
  Page,
  PageHeader,
  Stack,
  Text,
  ThemeControl,
  useTheme
} from "@flicksend/ui";
import { useCurrentAccount } from "./current-account-provider";
import { SignOutAction } from "./sign-out-action";

function ThemeUtility() {
  const theme = useTheme();
  return <ThemeControl preference={theme.preference} onPreferenceChange={theme.setPreference} />;
}

export function AccountWorkspace({ fixture }: { fixture: boolean }) {
  const principal = useCurrentAccount();
  const accountName = principal?.displayName ?? "Your account";
  return (
    <AppShell
      activeId="account"
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
            Account
          </Heading>
          <Text tone="secondary">Signed in as {accountName}.</Text>
        </PageHeader>
        <Card className="p10-account-card">
          <Stack gap="md">
            <div>
              <Text as="p" size="label" tone="muted">
                Name
              </Text>
              <Text>{principal?.displayName ?? "Not available"}</Text>
            </div>
            <div>
              <Text as="p" size="label" tone="muted">
                Email
              </Text>
              <Text>{principal?.primaryEmail ?? "Not available"}</Text>
              {principal?.primaryEmail && principal.emailVerified ? (
                <Text as="p" size="small" tone="secondary">
                  Verified email
                </Text>
              ) : null}
            </div>
            <Inline gap="sm">
              <SignOutAction fixture={fixture} />
            </Inline>
          </Stack>
        </Card>
      </Page>
    </AppShell>
  );
}
