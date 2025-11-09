"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createBrowserSupabaseClient } from "@supabase/auth-helpers-nextjs";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

type SupabaseContextType = {
  supabase: SupabaseClient<Database>;
  session: Session | null;
};

const SupabaseContext = createContext<SupabaseContextType | undefined>(
  undefined,
);

type SupabaseProviderProps = {
  children: ReactNode;
  initialSession: Session | null;
};

export function SupabaseProvider({
  children,
  initialSession,
}: SupabaseProviderProps) {
  const [supabaseClient] = useState(() =>
    createBrowserSupabaseClient<Database>(),
  );

  const value = useMemo(
    () => ({ supabase: supabaseClient, session: initialSession }),
    [supabaseClient, initialSession],
  );

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
}

export const useSupabase = (): SupabaseContextType => {
  const context = useContext(SupabaseContext);

  if (!context) {
    throw new Error("useSupabase must be used within a SupabaseProvider");
  }

  return context;
};

