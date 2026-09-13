import { redirect } from "next/navigation";
import { AuthPage } from "../auth/auth-page";
import { hasClerkConfiguration, isDevelopmentAuthFixtureEnabled } from "../auth/config";
import { getOptionalAuthenticatedPrincipal } from "../auth/provider.server";
import { safeReturnPath } from "../auth/safe-return-path";

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ fixture?: string; returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnPath(params.returnTo);
  const session = await getOptionalAuthenticatedPrincipal({ fixture: params.fixture });
  if (session.state === "SIGNED_IN") redirect(returnTo);
  return (
    <AuthPage
      configured={hasClerkConfiguration()}
      fixtureEnabled={isDevelopmentAuthFixtureEnabled()}
      mode="sign-in"
      returnTo={returnTo}
    />
  );
}
