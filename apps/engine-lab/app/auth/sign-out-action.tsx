"use client";

import { useClerk } from "@clerk/nextjs";
import { Button } from "@flicksend/ui";

function ClerkSignOut() {
  const { signOut } = useClerk();
  return <Button onClick={() => void signOut({ redirectUrl: "/sign-in" })}>Sign out</Button>;
}

/** The fixture action does not create or destroy a production provider session. */
export function SignOutAction({ fixture }: { fixture: boolean }) {
  if (fixture)
    return (
      <a className="fs-button fs-button--primary fs-button--md" href="/sign-in?fixture=signed-out">
        Sign out
      </a>
    );
  return <ClerkSignOut />;
}
