import { create } from "zustand";
type Center = "connect" | "calendar" | "notifications";
export const useCenter = create<{
  center: Center | null;
  conversation: string | null;
  open: (center: Center, conversation?: string) => void;
  close: () => void;
  select: (id: string | null) => void;
}>((set) => ({
  center: null,
  conversation: null,
  open: (center, conversation) =>
    set({ center, ...(conversation ? { conversation } : {}) }),
  close: () => set({ center: null }),
  select: (conversation) => set({ conversation }),
}));
export function openCenter(center: Center, conversation?: string) {
  useCenter.getState().open(center, conversation);
}
