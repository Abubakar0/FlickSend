import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { hasClerkConfiguration } from "./config";

/** Keeps Clerk provider configuration out of product route and controller modules. */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!hasClerkConfiguration()) return children;
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
      {children}
    </ClerkProvider>
  );
}
