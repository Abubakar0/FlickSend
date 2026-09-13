"use client";

import { PeopleProvider, usePeople } from "../people/people-provider";
import { isSendEligible, type PersonIdentity } from "../people/people-types";
import { TransfersProvider, type TransfersRepositoryMode, useTransfers } from "./transfers-provider";
import { TransferDetail, TransfersWorkspace } from "./transfers-workspace";

function TransfersContent({ recordId }: { recordId?: string }) {
  const people = usePeople();
  const transfers = useTransfers();
  const resolvePerson = (personId: string | null) => {
    if (!personId) return { displayName: "Unknown person", eligibleForSendAgain: false };
    const relationship = people.snapshot.relationships.find(
      (candidate) => candidate.person.id === personId
    );
    if (!relationship) return { displayName: "Former connection", eligibleForSendAgain: false };
    return {
      displayName: relationship.person.displayName,
      eligibleForSendAgain: isSendEligible(relationship)
    };
  };
  return recordId ? (
    <TransferDetail
      getRecord={transfers.controller.get.bind(transfers.controller)}
      resolvePerson={resolvePerson}
      recordId={recordId}
    />
  ) : (
    <TransfersWorkspace
      onFilterChange={transfers.controller.setFilter.bind(transfers.controller)}
      resolvePerson={resolvePerson}
      snapshot={transfers.snapshot}
    />
  );
}

export function TransfersBoundary({
  currentPerson,
  mode = "development",
  recordId
}: {
  currentPerson: PersonIdentity;
  mode?: TransfersRepositoryMode;
  recordId?: string;
}) {
  return (
    <PeopleProvider currentPerson={currentPerson} mode={mode}>
      <TransfersProvider currentPersonId={currentPerson.id} mode={mode}>
        <TransfersContent recordId={recordId} />
      </TransfersProvider>
    </PeopleProvider>
  );
}
