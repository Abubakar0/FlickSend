import { AuthConfigurationUnavailable } from "../auth/auth-configuration-unavailable";
import { CurrentAccountProvider } from "../auth/current-account-provider";
import { PersistenceUnavailableWorkspace } from "../auth/persistence-unavailable-workspace";
import { requireAuthenticatedPrincipal } from "../auth/provider.server";
import { resolveOrProvisionAccount } from "../persistence/account";
import { persistentPerson } from "../persistence/person";
import { PeopleProvider } from "./people-provider";
import { PeopleWorkspace } from "./people-workspace";
import { developmentPersonById } from "./people-types";

export default async function PeoplePage({
  searchParams
}: {
  searchParams: Promise<{ as?: string; fixture?: string }>;
}) {
  const params = await searchParams;
  const session = await requireAuthenticatedPrincipal("/people", params);
  if (session.state === "CONFIGURATION_UNAVAILABLE") return <AuthConfigurationUnavailable />;
  if (!session.principal) return null;
  const content = session.fixturePersonId ? (
    <PeopleProvider currentPerson={developmentPersonById(session.fixturePersonId)}>
      <PeopleWorkspace />
    </PeopleProvider>
  ) : (
    await awaitPersistentPeople(session.principal)
  );
  return <CurrentAccountProvider principal={session.principal}>{content}</CurrentAccountProvider>;
}

async function awaitPersistentPeople(
  principal: NonNullable<Awaited<ReturnType<typeof requireAuthenticatedPrincipal>>["principal"]>
) {
  try {
    const account = await resolveOrProvisionAccount(principal);
    return (
      <PeopleProvider currentPerson={persistentPerson(account)} mode="persistent">
        <PeopleWorkspace />
      </PeopleProvider>
    );
  } catch {
    return <PersistenceUnavailableWorkspace area="people" />;
  }
}
