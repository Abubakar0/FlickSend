import {
  defaultDevelopmentPersonId,
  developmentPeople,
  developmentPersonById
} from "../people/people-types";
import { isDevelopmentAuthFixtureEnabled, type AuthEnvironment } from "./config";
import type { AuthFixtureRequest, AuthSession } from "./types";

const signedOutFixture = "signed-out";

/**
 * P10 DEVELOPMENT AUTH IDENTITY FIXTURE. This is a deterministic qualification
 * adapter, not authentication and never runs in a production environment.
 */
export function developmentFixtureSession(
  request: AuthFixtureRequest = {},
  environment: AuthEnvironment = process.env
): AuthSession | null {
  if (!isDevelopmentAuthFixtureEnabled(environment)) return null;
  if (request.fixture === signedOutFixture)
    return {
      fixturePersonId: null,
      principal: null,
      source: "development-fixture",
      state: "SIGNED_OUT"
    };

  const selected = developmentPeople.some((person) => person.id === request.as)
    ? request.as!
    : defaultDevelopmentPersonId;
  const person = developmentPersonById(selected);
  return {
    fixturePersonId: person.id,
    principal: {
      displayName: person.displayName,
      emailVerified: null,
      primaryEmail: null,
      principalId: `development-fixture:${person.id}`
    },
    source: "development-fixture",
    state: "SIGNED_IN"
  };
}
