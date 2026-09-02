import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function requireEnvironment(name) {
  const value = process.env[name]?.trim();

  if (!value) throw new Error(`${name} is required`);
  return value;
}

function client(url, key) {
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
      .select("id, tenant_id")
      .eq("id", userId)
      .maybeSingle();

    if (!error && data) return data;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Temporary Auth user did not receive a Core profile");
}

async function apiRequest(baseUrl, path, token, init = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body && { "content-type": "application/json" }),
      ...init.headers,
    },
  });
}

const supabaseUrl = requireEnvironment("SUPABASE_URL");
const publishableKey = requireEnvironment("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
const apiBaseUrl = requireEnvironment("API_BASE_URL").replace(/\/$/, "");

const admin = client(supabaseUrl, serviceRoleKey);
const anonymous = client(supabaseUrl, publishableKey);
const authenticated = client(supabaseUrl, publishableKey);
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const tenantCode = `VERIFY_${Date.now()}`;
const tenantName = `SEKOLA tenant verification ${suffix}`;
const email = `sekola-tenant-check+${suffix}@example.com`;
const password = `Sekola-${randomBytes(18).toString("base64url")}!9a`;
let temporaryTenantId;
let temporaryUserId;

try {
  const { data: existingTenant, error: existingTenantError } = await admin
    .from("tenants")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (existingTenantError || !existingTenant) {
    throw existingTenantError ?? new Error("An existing active tenant is required");
  }

  const { data: ownPermission, error: permissionError } = await admin
    .from("permissions")
    .select("id")
    .eq("code", "tenants.update_own")
    .single();
  if (permissionError || !ownPermission) {
    throw permissionError ?? new Error("tenants.update_own is unavailable");
  }

  const { data: permissionRoles, error: roleMappingError } = await admin
    .from("role_permissions")
    .select("role_id")
    .eq("permission_id", ownPermission.id);
  if (roleMappingError) throw roleMappingError;

  const roleIds = [...new Set(permissionRoles?.map((item) => item.role_id))];
  assert(roleIds.length > 0, "No role has tenants.update_own");

  const { data: levelMappings, error: levelMappingError } = await admin
    .from("user_level_roles")
    .select("user_level_id")
    .in("role_id", roleIds);
  if (levelMappingError) throw levelMappingError;

  const levelIds = [
    ...new Set(levelMappings?.map((item) => item.user_level_id)),
  ];
  assert(levelIds.length > 0, "No user level inherits tenants.update_own");

  const { data: levels, error: levelError } = await admin
    .from("user_levels")
    .select("id, code")
    .in("id", levelIds)
    .eq("is_active", true);
  if (levelError) throw levelError;

  const adminLevel = levels?.find(
    (level) => !level.code.toUpperCase().includes("SUPER"),
  ) ?? levels?.[0];
  assert(adminLevel, "No active user level inherits tenants.update_own");

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({ code: tenantCode, name: tenantName })
    .select("id, code, name")
    .single();

  if (tenantError || !tenant) {
    throw tenantError ?? new Error("Unable to create temporary tenant");
  }
  temporaryTenantId = tenant.id;

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      app_metadata: { tenant_id: tenant.id },
      email,
      email_confirm: true,
      password,
      user_metadata: { full_name: "SEKOLA tenant verification" },
    });

  if (createError || !created.user) {
    throw createError ?? new Error("Unable to create temporary tenant user");
  }
  temporaryUserId = created.user.id;

  const profile = await waitForProfile(admin, temporaryUserId);
  assert(profile.tenant_id === tenant.id, "Temporary user tenant does not match");

  const { error: levelUpdateError } = await admin
    .from("users")
    .update({ user_level_id: adminLevel.id })
    .eq("id", temporaryUserId);
  if (levelUpdateError) throw levelUpdateError;

  const { data: login, error: loginError } =
    await authenticated.auth.signInWithPassword({ email, password });
  if (loginError || !login.session) {
    throw loginError ?? new Error("Temporary tenant login failed");
  }
  const token = login.session.access_token;

  const ownResponse = await apiRequest(apiBaseUrl, "/tenants/me", token);
  assert(ownResponse.status === 200, `Own tenant read returned ${ownResponse.status}`);
  const ownPayload = await ownResponse.json();
  assert(ownPayload.data?.id === tenant.id, "Own tenant API returned another tenant");
  console.log("✓ Tenant Admin read only its own tenant context");

  const updateResponse = await apiRequest(apiBaseUrl, "/tenants/me", token, {
    body: JSON.stringify({ name: tenantName }),
    method: "PATCH",
  });
  assert(
    updateResponse.status === 200,
    `Own tenant update returned ${updateResponse.status}`,
  );
  console.log("✓ Tenant Admin updated its own tenant profile");

  const listResponse = await apiRequest(apiBaseUrl, "/tenants", token);
  assert(listResponse.status === 403, `Tenant list returned ${listResponse.status}`);

  const crossTenantResponse = await apiRequest(
    apiBaseUrl,
    `/tenants/${existingTenant.id}`,
    token,
  );
  assert(
    crossTenantResponse.status === 403,
    `Cross-tenant detail returned ${crossTenantResponse.status}`,
  );
  console.log("✓ Tenant Admin cannot enumerate or read another tenant");

  const { data: directRows, error: directError } = await authenticated
    .from("tenants")
    .select("id");
  if (directError) throw directError;
  assert(
    directRows?.length === 1 && directRows[0].id === tenant.id,
    "Authenticated RLS query returned an unexpected tenant set",
  );
  console.log("✓ Authenticated direct query is isolated by RLS");

  const { data: anonymousRows, error: anonymousError } = await anonymous
    .from("tenants")
    .select("id");
  assert(
    Boolean(anonymousError) || anonymousRows?.length === 0,
    "Anonymous tenant query returned rows",
  );
  console.log("✓ Anonymous direct query cannot read tenants");

  const { error: deactivateError } = await admin
    .from("tenants")
    .update({ is_active: false })
    .eq("id", tenant.id);
  if (deactivateError) throw deactivateError;

  const inactiveResponse = await apiRequest(apiBaseUrl, "/tenants/me", token);
  assert(
    inactiveResponse.status === 401,
    `Inactive tenant API request returned ${inactiveResponse.status}`,
  );
  console.log("✓ Users of an inactive tenant are rejected by the API");
} finally {
  if (temporaryUserId) {
    const { error } = await admin.auth.admin.deleteUser(temporaryUserId);
    if (error) {
      console.error(`User cleanup warning: ${error.message}`);
      process.exitCode = 1;
    }
  }

  if (temporaryTenantId) {
    const { error } = await admin
      .from("tenants")
      .delete()
      .eq("id", temporaryTenantId);
    if (error) {
      console.error(`Tenant cleanup warning: ${error.message}`);
      process.exitCode = 1;
    }
  }

  if (temporaryUserId || temporaryTenantId) {
    console.log("✓ Temporary tenant verification data removed");
  }
}
