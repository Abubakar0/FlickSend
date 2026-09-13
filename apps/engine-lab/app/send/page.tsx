import { AuthConfigurationUnavailable } from "../auth/auth-configuration-unavailable";
import { CurrentAccountProvider } from "../auth/current-account-provider";
import { PersistenceUnavailableWorkspace } from "../auth/persistence-unavailable-workspace";
import { requireAuthenticatedPrincipal } from "../auth/provider.server";
import { developmentPersonById } from "../people/people-types";
import { resolveOrProvisionAccount } from "../persistence/account";
import { persistentPerson } from "../persistence/person";
import { SendPeopleBoundary } from "./send-people-boundary";
import "./send.css";

export default async function SendPage({
  searchParams
}: {
  searchParams: Promise<{ as?: string; fixture?: string; person?: string }>;
}) {
  const params = await searchParams;
  const session = await requireAuthenticatedPrincipal("/send", params);
  if (session.state === "CONFIGURATION_UNAVAILABLE") return <AuthConfigurationUnavailable />;
  if (!session.principal) return null;
  const content = session.fixturePersonId ? (
    <SendPeopleBoundary
      currentPerson={developmentPersonById(session.fixturePersonId)}
      preselectedRecipientId={params.person ?? null}
    />
  ) : (
    await awaitPersistentSend(session.principal, params.person ?? null)
  );
  return (
    <CurrentAccountProvider principal={session.principal}>
      {content}
    </CurrentAccountProvider>
  );
}

async function awaitPersistentSend(
  principal: NonNullable<Awaited<ReturnType<typeof requireAuthenticatedPrincipal>>["principal"]>,
  preselectedRecipientId: string | null
) {
  try {
    const account = await resolveOrProvisionAccount(principal);
    return (
      <SendPeopleBoundary
        currentPerson={persistentPerson(account)}
        mode="persistent"
        preselectedRecipientId={preselectedRecipientId}
      />
    );
  } catch {
    return <PersistenceUnavailableWorkspace area="send" />;
  }
}
