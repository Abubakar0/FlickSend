export type AuthEnvironment = Readonly<Record<string, string | undefined>>;

/** Clerk needs both keys at runtime; builds deliberately do not embed either key. */
export function hasClerkConfiguration(environment: AuthEnvironment = process.env): boolean {
  return Boolean(environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && environment.CLERK_SECRET_KEY);
}

/**
 * This switch is intentionally absent in production. It keeps the retained P4-P9
 * synthetic identities available only to deterministic Engine Lab qualification.
 */
export function isDevelopmentAuthFixtureEnabled(
  environment: AuthEnvironment = process.env
): boolean {
  return (
    environment.NODE_ENV !== "production" && environment.FLICKSEND_DEVELOPMENT_AUTH_FIXTURE === "1"
  );
}
