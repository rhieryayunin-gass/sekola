"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "../../lib/supabase/client";
import { useAuthStore } from "../../stores/auth-store";
import type { MediaBucket, MediaContext } from "../../lib/media";

export function useMediaContext() {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({ queryKey: ["media", "context", userId], enabled: !!userId, queryFn: async () => {
    const { data, error } = await createClient().rpc("media_context");
    if (error) throw error;
    if (!data) throw new Error("Media account unavailable");
    return data as MediaContext;
  } });
}
export function useMediaEntries(bucket: MediaBucket, prefix?: string) {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({ queryKey: ["media", "files", userId, bucket, prefix], enabled: !!userId && !!prefix, queryFn: async () => {
    const files = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await createClient().storage.from(bucket).list(prefix!, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw error;
      files.push(...data);
      if (data.length < 100) break;
    }
    return files;
  } });
}
