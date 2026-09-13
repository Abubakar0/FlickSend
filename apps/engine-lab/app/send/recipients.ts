import type { Presence } from "@flicksend/ui";

/** P4 development-only recipient contract. P6 replaces this fixture provider with People data. */
export type SendRecipient = {
  id: string;
  displayName: string;
  presence: Presence;
};

export type CurrentUser = {
  id: string;
  displayName: string;
  source: "development-fixture" | "persistent";
};

export const developmentCurrentUser: CurrentUser = {
  id: "dev-sender",
  displayName: "Development sender",
  source: "development-fixture"
};

/** Synthetic data only. This is neither authorization nor a persistent People implementation. */
export const developmentRecipients: readonly SendRecipient[] = [
  { id: "alex-morgan", displayName: "Alex Morgan", presence: "available" },
  { id: "jordan-lee", displayName: "Jordan Lee", presence: "unknown" },
  {
    id: "aurelia-montgomery-smythe-rivera",
    displayName: "Aurelia Montgomery-Smythe-Rivera",
    presence: "unavailable"
  }
];
