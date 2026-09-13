"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { AuthPrincipal } from "./types";

const CurrentAccountContext = createContext<AuthPrincipal | null>(null);

/** Presentation context only. Authentication authority remains server-side. */
export function CurrentAccountProvider({
  children,
  principal
}: {
  children: ReactNode;
  principal: AuthPrincipal;
}) {
  return (
    <CurrentAccountContext.Provider value={principal}>{children}</CurrentAccountContext.Provider>
  );
}

export function useCurrentAccount(): AuthPrincipal | null {
  return useContext(CurrentAccountContext);
}
