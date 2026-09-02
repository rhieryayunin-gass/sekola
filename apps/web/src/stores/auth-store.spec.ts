import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../lib/supabase/client";
import { useAuthStore } from "./auth-store";

vi.mock("../lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

const user = { id: "user-id", email: "owner@school.edu" } as User;
const session = {
  access_token: "access-token",
  expires_at: 4_000_000_000,
  expires_in: 3600,
  refresh_token: "refresh-token",
  token_type: "bearer",
  user,
} as Session;

function mockClient() {
  const auth = {
    getSession: vi.fn().mockResolvedValue({
      data: { session },
      error: null,
    }),
    refreshSession: vi.fn().mockResolvedValue({
      data: { session },
      error: null,
    }),
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { session, user },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };

  vi.mocked(createClient).mockReturnValue({ auth } as unknown as SupabaseClient);
  return auth;
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    error: null,
    session: null,
    status: "initializing",
    user: null,
  });
});

describe("useAuthStore", () => {
  it("initializes from an existing session", async () => {
    mockClient();

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState()).toMatchObject({
      session,
      status: "authenticated",
      user,
    });
  });

  it("signs in with email and password", async () => {
    const auth = mockClient();

    await useAuthStore.getState().signIn({
      email: "owner@school.edu",
      password: "secure-password",
    });

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "owner@school.edu",
      password: "secure-password",
    });
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("clears the local session after sign out", async () => {
    mockClient();
    useAuthStore.setState({ session, status: "authenticated", user });

    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState()).toMatchObject({
      session: null,
      status: "anonymous",
      user: null,
    });
  });
});
