import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "database/migrations/0008_auth_user_metadata_sequence.sql",
  ),
  "utf8",
);

describe("Auth user metadata sequencing migration", () => {
  it("defers tenant provisioning during the initial metadata-free insert", () => {
    expect(migration).toContain("if tg_op = 'INSERT'");
    expect(migration).toContain("return new;");
  });

  it("provisions after trusted app metadata is updated", () => {
    expect(migration).toContain(
      "update of email, raw_app_meta_data, raw_user_meta_data",
    );
    expect(migration).toContain(
      "coalesce(existing_tenant_id, metadata_tenant_id)",
    );
  });

  it("rejects cross-tenant metadata changes", () => {
    expect(migration).toContain(
      "Auth app metadata cannot move an existing user to another tenant",
    );
  });
});
