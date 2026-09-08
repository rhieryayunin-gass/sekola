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

async function apiRequest(baseUrl, path, token, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body && { "content-type": "application/json" }),
      ...init.headers,
    },
  });
  const payload = await response.json();

  return { payload, response };
}

async function adminUserLevel(admin) {
  const requiredCodes = [
    "users.create",
    "users.read",
    "users.status",
    "users.update",
  ];
  const { data: permissions, error: permissionError } = await admin
    .from("permissions")
    .select("id, code")
    .in("code", requiredCodes);
  if (permissionError) throw permissionError;
  assert(
    permissions?.length === requiredCodes.length,
    "User management permissions are incomplete",
  );

  const permissionIds = permissions.map((permission) => permission.id);
  const { data: mappings, error: mappingError } = await admin
    .from("role_permissions")
    .select("role_id, permission_id")
    .in("permission_id", permissionIds);
  if (mappingError) throw mappingError;

  const permissionCounts = new Map();
  for (const mapping of mappings ?? []) {
    const current = permissionCounts.get(mapping.role_id) ?? new Set();
    current.add(mapping.permission_id);
    permissionCounts.set(mapping.role_id, current);
  }
  const roleIds = [...permissionCounts.entries()]
    .filter(([, ids]) => ids.size === permissionIds.length)
    .map(([roleId]) => roleId);
  assert(roleIds.length > 0, "No role has every Phase 05 permission");

  const { data: levelMappings, error: levelMappingError } = await admin
    .from("user_level_roles")
    .select("user_level_id")
    .in("role_id", roleIds);
  if (levelMappingError) throw levelMappingError;

  const levelIds = [
    ...new Set(levelMappings?.map((mapping) => mapping.user_level_id)),
  ];
  assert(levelIds.length > 0, "No user level inherits Phase 05 permissions");

  const { data: levels, error: levelError } = await admin
    .from("user_levels")
    .select("id, code")
    .in("id", levelIds)
    .eq("is_active", true);
  if (levelError) throw levelError;
  const tenantAdminLevel = levels?.find(
    (level) => !level.code.toUpperCase().includes("SUPER"),
  );
  assert(
    tenantAdminLevel,
    "No active tenant administrator level has Phase 05 permissions",
  );

  return tenantAdminLevel;
}

const supabaseUrl = requireEnvironment("SUPABASE_URL");
const publishableKey = requireEnvironment("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
const apiBaseUrl = requireEnvironment("API_BASE_URL").replace(/\/$/, "");
const admin = client(supabaseUrl, serviceRoleKey);
const authenticated = client(supabaseUrl, publishableKey);
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const adminEmail = `sekola-users-admin+${suffix}@example.com`;
const targetEmail = `sekola-users-target+${suffix}@example.com`;
const changedEmail = `sekola-users-updated+${suffix}@example.com`;
const password = `Sekola-${randomBytes(18).toString("base64url")}!9a`;
let temporaryTenantId;
let temporaryAdminId;
let temporaryTargetId;

try {
  const level = await adminUserLevel(admin);
  const { data: existingOtherUser, error: existingUserError } = await admin
    .from("users")
    .select("id, tenant_id")
    .limit(1)
    .maybeSingle();
  if (existingUserError || !existingOtherUser) {
    throw existingUserError ?? new Error("An existing user is required");
  }

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({
      code: `USERS_${Date.now()}`,
      name: `SEKOLA users verification ${suffix}`,
    })
    .select("id")
    .single();
  if (tenantError || !tenant) {
    throw tenantError ?? new Error("Unable to create temporary tenant");
  }
  temporaryTenantId = tenant.id;

  const { data: createdAdmin, error: createAdminError } =
    await admin.auth.admin.createUser({
      app_metadata: { tenant_id: tenant.id },
      email: adminEmail,
      email_confirm: true,
      password,
      user_metadata: { full_name: "Phase 05 verifier" },
    });
  if (createAdminError || !createdAdmin.user) {
    throw createAdminError ?? new Error("Unable to create temporary admin");
  }
  temporaryAdminId = createdAdmin.user.id;

  const { error: levelUpdateError } = await admin
    .from("users")
    .update({ user_level_id: level.id })
    .eq("id", temporaryAdminId);
  if (levelUpdateError) throw levelUpdateError;

  const { data: login, error: loginError } =
    await authenticated.auth.signInWithPassword({
      email: adminEmail,
      password,
    });
  if (loginError || !login.session) {
    throw loginError ?? new Error("Temporary admin login failed");
  }
  const token = login.session.access_token;

  const createResult = await apiRequest(apiBaseUrl, "/users", token, {
    body: JSON.stringify({
      email: targetEmail,
      full_name: "Phase 05 target",
      user_level_id: level.id,
    }),
    method: "POST",
  });
  assert(
    createResult.response.status === 201,
    `User create returned ${createResult.response.status}`,
  );
  temporaryTargetId = createResult.payload.data?.id;
  assert(temporaryTargetId, "User create did not return a profile");
  assert(
    createResult.payload.data.tenant_id === tenant.id,
    "Created user escaped the current tenant",
  );
  console.log("✓ User creation synchronized Auth and Core tenant context");

  const listResult = await apiRequest(
    apiBaseUrl,
    `/users?email=${encodeURIComponent(targetEmail)}&status=active`,
    token,
  );
  assert(listResult.response.status === 200, "User list request failed");
  assert(
    listResult.payload.data?.items?.length === 1 &&
      listResult.payload.data.items[0].id === temporaryTargetId,
    "Tenant user list did not return the created user",
  );
  console.log("✓ User master pagination and filters returned tenant data");

  const crossTenantResult = await apiRequest(
    apiBaseUrl,
    `/users/${existingOtherUser.id}`,
    token,
  );
  assert(
    crossTenantResult.response.status === 404,
    `Cross-tenant user read returned ${crossTenantResult.response.status}`,
  );
  console.log("✓ Cross-tenant user detail is hidden");

  const updateResult = await apiRequest(
    apiBaseUrl,
    `/users/${temporaryTargetId}`,
    token,
    {
      body: JSON.stringify({
        email: changedEmail,
        full_name: "Phase 05 updated target",
      }),
      method: "PATCH",
    },
  );
  assert(
    updateResult.response.status === 200,
    `User update returned ${updateResult.response.status}`,
  );
  const { data: updatedAuth, error: updatedAuthError } =
    await admin.auth.admin.getUserById(temporaryTargetId);
  if (updatedAuthError || !updatedAuth.user) {
    throw updatedAuthError ?? new Error("Updated Auth user is unavailable");
  }
  assert(updatedAuth.user.email === changedEmail, "Auth email was not updated");
  assert(
    updatedAuth.user.user_metadata?.full_name ===
      "Phase 05 updated target",
    "Auth full name was not updated",
  );
  console.log("✓ User profile changes synchronized to Supabase Auth");

  const selfStatusResult = await apiRequest(
    apiBaseUrl,
    `/users/${temporaryAdminId}/status`,
    token,
    {
      body: JSON.stringify({ is_active: false }),
      method: "PATCH",
    },
  );
  assert(
    selfStatusResult.response.status === 400,
    `Self-deactivation returned ${selfStatusResult.response.status}`,
  );
  console.log("✓ Administrator cannot deactivate their own account");

  const deactivateResult = await apiRequest(
    apiBaseUrl,
    `/users/${temporaryTargetId}/status`,
    token,
    {
      body: JSON.stringify({ is_active: false }),
      method: "PATCH",
    },
  );
  assert(
    deactivateResult.response.status === 200 &&
      deactivateResult.payload.data?.is_active === false,
    "User deactivation did not update the Core profile",
  );
  const { data: bannedAuth, error: bannedAuthError } =
    await admin.auth.admin.getUserById(temporaryTargetId);
  if (bannedAuthError || !bannedAuth.user) {
    throw bannedAuthError ?? new Error("Deactivated Auth user is unavailable");
  }
  assert(
    Boolean(bannedAuth.user.banned_until),
    "Deactivated user was not banned in Supabase Auth",
  );
  console.log("✓ User deactivation blocked the Auth account");

  const activateResult = await apiRequest(
    apiBaseUrl,
    `/users/${temporaryTargetId}/status`,
    token,
    {
      body: JSON.stringify({ is_active: true }),
      method: "PATCH",
    },
  );
  assert(
    activateResult.response.status === 200 &&
      activateResult.payload.data?.is_active === true,
    "User reactivation failed",
  );
  console.log("✓ User activation restored the Auth and Core account");

  const { data: directRows, error: directError } = await authenticated
    .from("users")
    .select("id");
  if (directError) throw directError;
  assert(
    directRows?.length === 1 && directRows[0].id === temporaryAdminId,
    "Direct authenticated query exposed another user profile",
  );
  console.log("✓ Direct database reads expose only the current profile");
} finally {
  for (const userId of [temporaryTargetId, temporaryAdminId]) {
    if (!userId) continue;
    const { error } = await admin.auth.admin.deleteUser(userId);
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

  if (temporaryTargetId || temporaryAdminId || temporaryTenantId) {
    console.log("✓ Temporary Phase 05 verification data removed");
  }
}
