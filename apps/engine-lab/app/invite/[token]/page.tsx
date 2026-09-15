import { getOptionalAuthenticatedPrincipal } from "../../auth/provider.server";
import { signInPath } from "../../auth/safe-return-path";
import { resolveOrProvisionAccount } from "../../persistence/account";
import { PersistentInvitationService } from "../../persistence/invitations";
import { InvitationPageContent } from "./invitation-page-content";

export default async function InvitationPage({
  params
}: Readonly<{
  params: Promise<{ token: string }>;
}>) {
  const { token } = await params;
  const available = await new PersistentInvitationService()
    .inspect(token)
    .then((state) => state === "AVAILABLE")
    .catch(() => false);
  if (!available) return <InvitationPageContent state="UNAVAILABLE" />;

  const session = await getOptionalAuthenticatedPrincipal();
  if (session.state !== "SIGNED_IN" || !session.principal)
    return (
      <InvitationPageContent signInHref={signInPath(`/invite/${token}`)} state="SIGN_IN_REQUIRED" />
    );
  try {
    await resolveOrProvisionAccount(session.principal);
  } catch {
    return <InvitationPageContent state="UNAVAILABLE" />;
  }
  return <InvitationPageContent state="READY" token={token} />;
}
