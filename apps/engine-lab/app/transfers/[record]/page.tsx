import "../transfers.css";
import { AuthConfigurationUnavailable } from "../../auth/auth-configuration-unavailable";
import { CurrentAccountProvider } from "../../auth/current-account-provider";
import { PersistenceUnavailableWorkspace } from "../../auth/persistence-unavailable-workspace";
import { requireAuthenticatedPrincipal } from "../../auth/provider.server";
import { developmentPersonById } from "../../people/people-types";
import { resolveOrProvisionAccount } from "../../persistence/account";
import { persistentPerson } from "../../persistence/person";
import { TransfersBoundary } from "../transfers-boundary";

export default async function TransferDetailPage({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ record: string }>;
  searchParams: Promise<{ as?: string; fixture?: string }>;
}>) {
  const [{ record }, query] = await Promise.all([params, searchParams]);
  const session = await requireAuthenticatedPrincipal(
    `/transfers/${encodeURIComponent(record)}`,
    query
  );
  if (session.state === "CONFIGURATION_UNAVAILABLE") return <AuthConfigurationUnavailable />;
  if (!session.principal) return null;
  const content = session.fixturePersonId ? (
    <TransfersBoundary
      currentPerson={developmentPersonById(session.fixturePersonId)}
      recordId={record}
    />
  ) : (
    await persistentTransferDetail(session.principal, record)
  );
  return <CurrentAccountProvider principal={session.principal}>{content}</CurrentAccountProvider>;
}

async function persistentTransferDetail(
  principal: NonNullable<Awaited<ReturnType<typeof requireAuthenticatedPrincipal>>["principal"]>,
  recordId: string
) {
  try {
    const account = await resolveOrProvisionAccount(principal);
    return (
      <TransfersBoundary
        currentPerson={persistentPerson(account)}
        mode="persistent"
        recordId={recordId}
      />
    );
  } catch {
    return <PersistenceUnavailableWorkspace area="transfers" />;
  }
}
