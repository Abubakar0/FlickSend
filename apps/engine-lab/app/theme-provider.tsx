"use client";

import { ThemeProvider } from "@flicksend/ui";
import type { ReactNode } from "react";

export function EngineLabThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
