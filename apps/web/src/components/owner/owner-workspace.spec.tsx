import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../lib/school", async original => ({ ...await original<typeof import("../../lib/school")>(), schoolRpc: rpc, useSchoolContext: () => ({ data: { tenant: { id: "owner-tenant" } } }) }));
vi.mock("../../stores/permission-store", () => ({ usePermissionStore: (select: (s: unknown) => unknown) => select({ context: { userId: "owner", roles: [{ code: "OWNER" }], permissions: [{ code: "tenants.update_all" }] } }) }));
vi.mock("../../stores/auth-store", () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ user: { user_metadata: { full_name: "Owner" } } }) }));
vi.mock("../media/media-uploader", () => ({ MediaUpload: () => <span>Logo upload</span> }));
import { OwnerDashboard } from "./owner-dashboard";
import { OwnerTenants } from "./owner-tenants";
import { FinanceEditor } from "./owner-finance";
import { OwnerForm } from "./owner-ui";
function wrap(children: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>); }
describe("Owner workspace interactions", () => {
  it("shows only four platform statistics linked to their management pages", async () => {
    rpc.mockResolvedValue({ tenants: 3, active_tenants: 2, users: 120, active_users: 100, partners: 4, active_partners: 3, income: 2000000, expenses: 200000, receivables: 500000 });
    wrap(<OwnerDashboard/>);
    await screen.findByRole("link", { name: /Tenant/ });
    expect(screen.getAllByRole("link").map(a => a.getAttribute("href"))).toEqual(["/dashboard/tenant", "/dashboard/finance", "/dashboard/partners", "/dashboard/users"]);
    expect(screen.queryByText("Your school, its operations and the decisions ahead.")).not.toBeInTheDocument();
  });
  it("saves a single module flag without replacing other tenant settings", async () => {
    rpc.mockImplementation(async name => name === "school_owner_list" ? { items: [{ id: "school-b", name: "Sekolah B", code: "B", is_active: true, modules: { core: true, learning: true }, plan_code: "ESSENTIAL" }], total: 1, page: 1, page_size: 20 } : {});
    wrap(<OwnerTenants/>);
    fireEvent.click(await screen.findByRole("switch", { name: "O-Learning · Sekolah B" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("school_owner_save", { kind: "module", record_id: "school-b", payload: { module: "learning", enabled: false } }));
  });
  it("creates an invoice from its real submit button with an idempotency key", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
    rpc.mockResolvedValue({ id: "invoice" }); const close = vi.fn();
    wrap(<FinanceEditor editor={{ kind: "invoice", row: { id: "school-b", name: "School", onboarded_on: "2026-01-01", expires_on: "2026-12-31", billing_period: "MONTHLY", period_amount: 100000 } }} close={close}/>);
    fireEvent.click(screen.getByRole("button", { name: "Buat & beri notifikasi tenant" }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("school_owner_save", expect.objectContaining({ kind: "invoice", payload: expect.objectContaining({ tenant_id: "school-b", amount: 100000, period_start: "2026-01-01", period_end: "2026-01-31", request_id: expect.any(String) }) }));
  });
  it("preserves intentional password whitespace", () => {
    const submit = vi.fn(); wrap(<OwnerForm fields={[{ key: "password", label: "ownerNewPassword", type: "password", required: true }]} pending={false} submit={submit}/>);
    fireEvent.change(screen.getByLabelText("Password baru"), { target: { value: "  intentional secret  " } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
    expect(submit).toHaveBeenCalledWith({ password: "  intentional secret  " });
  });
});
