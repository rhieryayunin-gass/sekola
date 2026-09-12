"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "../../lib/supabase/client";
import { usePermissionStore } from "../../stores/permission-store";
export function UnreadIndicator({ connect = false }: { connect?: boolean }) {
  const userId = usePermissionStore(s => s.context?.userId);
  const q = useQuery({ queryKey: ["notification-badge", userId, connect], enabled: !!userId, refetchInterval: 15_000, queryFn: async () => {
    let query = createClient().from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId!).is("read_at", null);
    if (connect) query = query.eq("resource_type", "oconnect");
    const { count, error } = await query; if (error) throw error; return count ?? 0;
  } });
  return q.data ? <span className="school-unread-dot" aria-label={`${q.data} unread`}/> : null;
}
