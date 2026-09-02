"use client";

import { useEffect, type ReactNode } from "react";
import { createClient } from "../../lib/supabase/client";
import { useAuthStore } from "../../stores/auth-store";

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialize = useAuthStore((state) => state.initialize);
  const setSession = useAuthStore((state) => state.setSession);

  useEffect(() => {
    const supabase = createClient();
    void initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [initialize, setSession]);

  return children;
}
