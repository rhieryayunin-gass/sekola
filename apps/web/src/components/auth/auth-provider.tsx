"use client";

import { useEffect, type ReactNode } from "react";
import { createClient } from "../../lib/supabase/client";
import { useAuthStore } from "../../stores/auth-store";
import { usePermissionStore } from "../../stores/permission-store";

export function AuthProvider({ children }: { children: ReactNode }) {
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
      setSession(session);
      if (session) void loadPermissions();
      else resetPermissions();
    });

    return () => subscription.unsubscribe();
  }, [initialize, loadPermissions, resetPermissions, setSession]);

  return children;
}
