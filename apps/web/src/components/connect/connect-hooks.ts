"use client";
import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/auth-store";
import { createClient } from "../../lib/supabase/client";
import { connectRpc, type ConnectContext, type Conversation, type Thread } from "../../lib/connect";

export function useConnectContext() {
  const user = useAuthStore(s => s.user?.id);
  return useQuery({ queryKey: ["connect", "context", user], enabled: !!user, queryFn: () => connectRpc<ConnectContext>("context") });
}
export function useConnectInbox(enabled = true) {
  const user = useAuthStore(s => s.user?.id);
  return useInfiniteQuery({ queryKey: ["connect", "inbox", user], enabled: !!user && enabled,
    initialPageParam: 0, queryFn: ({ pageParam }) => connectRpc<Conversation[]>("inbox", { page: pageParam }),
    getNextPageParam: (page, pages) => page.length === 100 ? pages.length : undefined,
    refetchInterval: 15000 });
}
export function useConnectThread(conversation: string, search: string) {
  const user = useAuthStore(s => s.user?.id);
  return useInfiniteQuery({ queryKey: ["connect", "thread", user, conversation, search], enabled: !!user,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => connectRpc<Thread>("thread", { conversation, before_seq: pageParam, search }),
    getNextPageParam: (page) => page.messages.length === 50 ? page.messages[0].seq : undefined,
    refetchInterval: 15000 });
}
export function useConnectRealtime(enabled: boolean) {
  const user = useAuthStore(s => s.user?.id);
  const cache = useQueryClient();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!user || !enabled) return;
    const client = createClient();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void cache.invalidateQueries({ queryKey: ["connect"] }); void cache.invalidateQueries({ queryKey: ["notifications"] }); }, 150);
    };
    let channel = client.channel(`oconnect:${user}`);
    for (const table of ["oconnect_messages", "oconnect_conversations", "oconnect_members", "oconnect_preferences"]) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    // Auth initialization may still be settling after login. Use the current
    // session before joining so the subscription receives authenticated RLS.
    void client.realtime.setAuth().then(() => {
      if (stopped) return;
      channel.subscribe(status => {
        if (stopped) return;
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") refresh();
      });
    }).catch(() => { if (!stopped) setConnected(false); });
    window.addEventListener("online", refresh);
    return () => { stopped = true; if (timer) clearTimeout(timer); window.removeEventListener("online", refresh); void client.removeChannel(channel); };
  }, [user, enabled, cache]);
  return connected;
}
