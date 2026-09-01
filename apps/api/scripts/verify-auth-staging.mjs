import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function requireEnvironment(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function createSupabaseClient(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForProfile(admin, userId) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const { data, error } = await admin
      .from("users")
      .select("id, email, is_active")
      .eq("id", userId)
      .maybeSingle();

    if (!error && data) return data;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Auth user was not synchronized to public.users");
}

async function requestApi(baseUrl, token) {
  return fetch(`${baseUrl}/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

const supabaseUrl = requireEnvironment("SUPABASE_URL");
const publishableKey = requireEnvironment("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
const apiBaseUrl = requireEnvironment("API_BASE_URL").replace(/\/$/, "");

const admin = createSupabaseClient(supabaseUrl, serviceRoleKey);
const auth = createSupabaseClient(supabaseUrl, publishableKey);
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const email = `sekola-auth-check+${suffix}@example.com`;
const password = `Sekola-${randomBytes(18).toString("base64url")}!9a`;
let userId;

try {
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
      user_metadata: { full_name: "SEKOLA staging verification" },
    });

  if (createError || !created.user) {
    throw createError ?? new Error("Unable to create staging verification user");
  }

  userId = created.user.id;
  const profile = await waitForProfile(admin, userId);
  assert(profile.email === email, "Synchronized profile email does not match");
  assert(profile.is_active === true, "New profile should be active");
  console.log("✓ Auth user synchronized to an active Core profile");

  const { data: invalidData, error: invalidError } =
    await auth.auth.signInWithPassword({ email, password: `${password}-invalid` });
  assert(invalidError && !invalidData.session, "Invalid credentials were accepted");
  console.log("✓ Invalid credentials rejected");

  const { data: loginData, error: loginError } =
    await auth.auth.signInWithPassword({ email, password });
  if (loginError || !loginData.session) {
    throw loginError ?? new Error("Valid login did not create a session");
  }

  const session = loginData.session;
  console.log("✓ Valid login created a session");

  const activeResponse = await requestApi(apiBaseUrl, session.access_token);
  assert(activeResponse.status === 200, `Active user API request returned ${activeResponse.status}`);
  console.log("✓ Active session accepted by NestJS API");

  const { data: refreshed, error: refreshError } =
    await auth.auth.refreshSession({ refresh_token: session.refresh_token });
  if (refreshError || !refreshed.session) {
    throw refreshError ?? new Error("Session refresh did not return a session");
  }
  console.log("✓ Session refresh succeeded");

  const { error: deactivateError } = await admin
    .from("users")
    .update({ is_active: false })
    .eq("id", userId);
  if (deactivateError) throw deactivateError;

  const inactiveResponse = await requestApi(
    apiBaseUrl,
    refreshed.session.access_token,
  );
  assert(inactiveResponse.status === 401, `Inactive user API request returned ${inactiveResponse.status}`);
  console.log("✓ Inactive Core profile rejected by NestJS API");

  const { error: signOutError } = await auth.auth.signOut({ scope: "global" });
  if (signOutError) throw signOutError;

  const { data: reusedData, error: reusedError } = await auth.auth.refreshSession({
    refresh_token: refreshed.session.refresh_token,
  });
  assert(reusedError && !reusedData.session, "Signed-out refresh token was accepted");
  console.log("✓ Logout invalidated the refresh session");
} finally {
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error(`Cleanup warning: ${error.message}`);
      process.exitCode = 1;
    } else {
      console.log("✓ Temporary verification user removed");
    }
  }
}
