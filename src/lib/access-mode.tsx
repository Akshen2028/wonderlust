"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ACCESS_STORAGE_KEY } from "@/lib/constants";

export type AccessMode = "viewer" | "admin";

type AccessContextValue = {
  mode: AccessMode | null;
  hydrated: boolean;
  isAdmin: boolean;
  isViewer: boolean;
  continueAsViewer: () => void;
  unlockAdmin: (password: string) => boolean;
  switchToViewer: () => void;
  logout: () => void;
};

const AccessContext = createContext<AccessContextValue | null>(null);

function readStoredMode(): AccessMode | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(ACCESS_STORAGE_KEY);
  if (v === "viewer" || v === "admin") return v;
  return null;
}

export function AccessModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AccessMode | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMode(readStoredMode());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: AccessMode | null) => {
    setMode(next);
    if (typeof window === "undefined") return;
    if (next) window.localStorage.setItem(ACCESS_STORAGE_KEY, next);
    else window.localStorage.removeItem(ACCESS_STORAGE_KEY);
  }, []);

  const continueAsViewer = useCallback(() => persist("viewer"), [persist]);

  const unlockAdmin = useCallback(
    (password: string) => {
      const expected = process.env.NEXT_PUBLIC_SITE_PASSWORD ?? "";
      if (!expected || password !== expected) return false;
      persist("admin");
      return true;
    },
    [persist]
  );

  const switchToViewer = useCallback(() => persist("viewer"), [persist]);

  const logout = useCallback(() => persist(null), [persist]);

  const value = useMemo<AccessContextValue>(
    () => ({
      mode,
      hydrated,
      isAdmin: mode === "admin",
      isViewer: mode === "viewer",
      continueAsViewer,
      unlockAdmin,
      switchToViewer,
      logout,
    }),
    [mode, hydrated, continueAsViewer, unlockAdmin, switchToViewer, logout]
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccessMode() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccessMode must be used within AccessModeProvider");
  return ctx;
}
