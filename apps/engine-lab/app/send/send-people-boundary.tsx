"use client";

import { connectedPeople } from "../people/people-state";
import { PeopleProvider, type PeopleRepositoryMode, usePeople } from "../people/people-provider";
import type { PersonIdentity } from "../people/people-types";
import { TransfersProvider, type TransfersRepositoryMode, useTransfers } from "../transfers/transfers-provider";
import { SendWorkspace } from "./send-workspace";

function ConnectedPeopleSendWorkspace({
  preselectedRecipientId,
  source
}: {
  preselectedRecipientId: string | null;
  source: "development-fixture" | "persistent";
}) {
  const { snapshot } = usePeople();
  const { recorder } = useTransfers();
  const currentUser = {
    id: snapshot.currentPerson.id,
    displayName: snapshot.currentPerson.displayName,
    source
  };
  const recipients = connectedPeople(snapshot).map((relationship) => ({
    id: relationship.person.id,
    displayName: relationship.person.displayName,
    presence: relationship.person.presence
  }));
  return (
    <SendWorkspace
      currentUser={currentUser}
      lifecycleRecorder={recorder}
      preselectedRecipientId={preselectedRecipientId}
      recipientSourceReady={!snapshot.isLoading}
      recipients={recipients}
    />
  );
}

export function SendPeopleBoundary({
  currentPerson,
  mode = "development",
  preselectedRecipientId
}: {
  currentPerson: PersonIdentity;
  mode?: PeopleRepositoryMode & TransfersRepositoryMode;
  preselectedRecipientId: string | null;
}) {
  return (
    <PeopleProvider currentPerson={currentPerson} mode={mode}>
      <TransfersProvider currentPersonId={currentPerson.id} mode={mode}>
        <ConnectedPeopleSendWorkspace
          preselectedRecipientId={preselectedRecipientId}
          source={mode === "persistent" ? "persistent" : "development-fixture"}
        />
      </TransfersProvider>
    </PeopleProvider>
  );
}
