import "./transfers.css";
import { AuthConfigurationUnavailable } from "../auth/auth-configuration-unavailable";
import { CurrentAccountProvider } from "../auth/current-account-provider";
import { PersistenceUnavailableWorkspace } from "../auth/persistence-unavailable-workspace";
import { requireAuthenticatedPrincipal } from "../auth/provider.server";
import { developmentPersonById } from "../people/people-types";
import { resolveOrProvisionAccount } from "../persistence/account";
import { persistentPerson } from "../persistence/person";
import { TransfersBoundary } from "./transfers-boundary";

export default async function TransfersPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ as?: string; fixture?: string }> }>) {
  const params = await searchParams;
  const session = await requireAuthenticatedPrincipal("/transfers", params);
  if (session.state === "CONFIGURATION_UNAVAILABLE") return <AuthConfigurationUnavailable />;
  if (!session.principal) return null;
  const content = session.fixturePersonId ? (
    <TransfersBoundary currentPerson={developmentPersonById(session.fixturePersonId)} />
  ) : (
    await awaitPersistentTransfers(session.principal)
  );
  return (
    <CurrentAccountProvider principal={session.principal}>
      {content}
    </CurrentAccountProvider>
  );
}

async function awaitPersistentTransfers(
  principal: NonNullable<Awaited<ReturnType<typeof requireAuthenticatedPrincipal>>["principal"]>
) {
  try {
    const account = await resolveOrProvisionAccount(principal);
    return <TransfersBoundary currentPerson={persistentPerson(account)} mode="persistent" />;
  } catch {
    return <PersistenceUnavailableWorkspace area="transfers" />;
  }
}
