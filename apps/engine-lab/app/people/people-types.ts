export type PersonPresence = "available" | "unavailable" | "unknown";

export type PersonIdentity = {
  avatarInitials?: string;
  displayName: string;
  id: string;
  presence: PersonPresence;
};

export const relationshipStates = [
  "UNCONNECTED",
  "INVITED_OUTGOING",
  "INVITED_INCOMING",
  "CONNECTED",
  "BLOCKED"
] as const;

export type RelationshipState = (typeof relationshipStates)[number];

export type PersonRelationship = {
  person: PersonIdentity;
  state: Exclude<RelationshipState, "UNCONNECTED">;
  updatedAt: string;
};

export type PeopleSnapshot = {
  currentPerson: PersonIdentity;
  relationships: readonly PersonRelationship[];
};

export const developmentPeople: readonly PersonIdentity[] = [
  {
    id: "dev-sender",
    displayName: "Development sender",
    avatarInitials: "DS",
    presence: "available"
  },
  { id: "alex-morgan", displayName: "Alex Morgan", presence: "available" },
  { id: "jordan-lee", displayName: "Jordan Lee", presence: "unknown" },
  { id: "taylor-chen", displayName: "Taylor Chen", presence: "unavailable" },
  { id: "morgan-reed", displayName: "Morgan Reed", presence: "available" },
  {
    id: "elodie-van-der-berg-luczak",
    displayName: "Elodie van der Berg-Luczak",
    presence: "unknown"
  }
];

export const defaultDevelopmentPersonId = "dev-sender";

export function developmentPersonById(personId: string | null | undefined): PersonIdentity {
  return (
    developmentPeople.find((person) => person.id === personId) ??
    developmentPeople.find((person) => person.id === defaultDevelopmentPersonId)!
  );
}

export function developmentPeopleSnapshot(personId: string): PeopleSnapshot {
  const currentPerson = developmentPersonById(personId);
  const defaultConnection = ["dev-sender", "alex-morgan"];
  const isDefaultConnection = defaultConnection.includes(currentPerson.id);
  const otherId = currentPerson.id === "dev-sender" ? "alex-morgan" : "dev-sender";
  const other = developmentPeople.find((person) => person.id === otherId);
  return {
    currentPerson,
    relationships:
      isDefaultConnection && other
        ? [{ person: other, state: "CONNECTED", updatedAt: "2026-09-12T00:00:00.000Z" }]
        : []
  };
}

export function isSendEligible(relationship: PersonRelationship): boolean {
  return relationship.state === "CONNECTED";
}
