"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "../../lib/supabase/client";
import { useAuthStore } from "../../stores/auth-store";
import { usePermissionStore } from "../../stores/permission-store";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const previousUser = useRef<string | null>(null);
  const initialize = useAuthStore((state) => state.initialize);
  const setSession = useAuthStore((state) => state.setSession);
  const loadPermissions = usePermissionStore((state) => state.load);
  const resetPermissions = usePermissionStore((state) => state.reset);

  useEffect(() => {
    const supabase = createClient();
    void initialize();
    void loadPermissions();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const identity = session?.user.id ?? null;
      if (previousUser.current !== identity || _event === "SIGNED_OUT") {
        void queryClient.cancelQueries();
        queryClient.clear();
        resetPermissions();
      }
      previousUser.current = identity;
      setSession(session);
      if (session) void loadPermissions();
      else resetPermissions();
    });

    return () => subscription.unsubscribe();
  }, [initialize, loadPermissions, resetPermissions, setSession, queryClient]);

  return children;
}
