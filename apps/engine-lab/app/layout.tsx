import type { Metadata } from "next";
import type { ReactNode } from "react";
import { workingBrand } from "@flicksend/shared";
import "@flicksend/ui/styles.css";
import "./globals.css";
import "./auth/auth.css";
import { AuthProvider } from "./auth/auth-provider";
import { EngineLabThemeProvider } from "./theme-provider";

export const metadata: Metadata = {
  title: `${workingBrand.name} Engine Lab`,
  description: "Browser transfer engine qualification and design-system showcase.",
  icons: { icon: workingBrand.favicon }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <EngineLabThemeProvider>{children}</EngineLabThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
