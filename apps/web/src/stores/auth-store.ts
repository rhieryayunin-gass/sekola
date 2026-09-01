import type { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";
import { createClient } from "../lib/supabase/client";

type AuthStatus = "initializing" | "authenticated" | "anonymous";

interface SignInInput {
  email: string;
  password: string;
}

interface AuthState {
  error: string | null;
  session: Session | null;
  status: AuthStatus;
  user: User | null;
  clearError: () => void;
  initialize: () => Promise<void>;
  refreshSession: () => Promise<Session | null>;
  setSession: (session: Session | null) => void;
  signIn: (input: SignInInput) => Promise<Session>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  error: null,
  session: null,
  status: "initializing",
  user: null,

  clearError() {
    set({ error: null });
  },

  async initialize() {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      set({
        error: error.message,
        session: null,
        status: "anonymous",
        user: null,
      });
      return;
    }

    set({
      error: null,
      session: data.session,
      status: data.session ? "authenticated" : "anonymous",
      user: data.session?.user ?? null,
    });
  },

  async refreshSession() {
    const supabase = createClient();
    const { data, error } = await supabase.auth.refreshSession();

    if (error) {
      set({
        error: error.message,
        session: null,
        status: "anonymous",
        user: null,
      });
      throw error;
    }

    set({
      error: null,
      session: data.session,
      status: data.session ? "authenticated" : "anonymous",
      user: data.session?.user ?? null,
    });

    return data.session;
  },

  setSession(session) {
    set({
      error: null,
      session,
      status: session ? "authenticated" : "anonymous",
      user: session?.user ?? null,
    });
  },

  async signIn({ email, password }) {
    const supabase = createClient();
    set({ error: null });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      const message = error?.message ?? "Unable to establish a session";
      set({ error: message, status: "anonymous" });
      throw error ?? new Error(message);
    }

    set({
      error: null,
      session: data.session,
      status: "authenticated",
      user: data.user,
    });

    return data.session;
  },

  async signOut() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    set({
      error: error?.message ?? null,
      session: null,
      status: "anonymous",
      user: null,
    });

    if (error) throw error;
  },
}));
