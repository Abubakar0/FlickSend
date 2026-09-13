/**
 * Provider-neutral account identity. `principalId` is server authority only and
 * must not be placed in product URLs, transfer records, or normal UI.
 */
export type AuthPrincipal = {
  displayName: string | null;
  emailVerified: boolean | null;
  primaryEmail: string | null;
  principalId: string;
};

export type AuthSessionState = "CONFIGURATION_UNAVAILABLE" | "SIGNED_IN" | "SIGNED_OUT";

export type AuthSession = {
  fixturePersonId: string | null;
  principal: AuthPrincipal | null;
  source: "clerk" | "development-fixture" | "unavailable";
  state: AuthSessionState;
};

export type AuthFixtureRequest = {
  as?: string | null;
  fixture?: string | null;
};
