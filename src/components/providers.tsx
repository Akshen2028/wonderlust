"use client";

import { AccessModeProvider } from "@/lib/access-mode";
import { ThemeProvider } from "@/lib/theme";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AccessModeProvider>{children}</AccessModeProvider>
    </ThemeProvider>
  );
}
