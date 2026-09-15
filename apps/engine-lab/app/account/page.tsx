import { AuthConfigurationUnavailable } from "../auth/auth-configuration-unavailable";
import { AccountWorkspace } from "../auth/account-workspace";
import { CurrentAccountProvider } from "../auth/current-account-provider";
import { PersistenceUnavailableWorkspace } from "../auth/persistence-unavailable-workspace";
import { requireAuthenticatedPrincipal } from "../auth/provider.server";
import { resolveOrProvisionAccount } from "../persistence/account";

export default async function AccountPage({
  searchParams
}: {
  searchParams: Promise<{ as?: string; fixture?: string }>;
}) {
  const params = await searchParams;
  const session = await requireAuthenticatedPrincipal("/account", params);
  if (session.state === "CONFIGURATION_UNAVAILABLE") return <AuthConfigurationUnavailable />;
  if (!session.principal) return null;
  const content =
    session.source === "development-fixture" ? (
      <AccountWorkspace fixture />
    ) : (
      await awaitPersistentAccount(session.principal)
    );
  return <CurrentAccountProvider principal={session.principal}>{content}</CurrentAccountProvider>;
}

async function awaitPersistentAccount(
  principal: NonNullable<Awaited<ReturnType<typeof requireAuthenticatedPrincipal>>["principal"]>
) {
  try {
    await resolveOrProvisionAccount(principal);
    return <AccountWorkspace fixture={false} />;
  } catch {
    return <PersistenceUnavailableWorkspace area="account" />;
  }
}
