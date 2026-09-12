import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
const { rpc, upload, replace } = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace }) }));
vi.mock("../../lib/supabase/client", () => ({ createClient: () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { rpc, channel: () => channel, removeChannel: vi.fn(), storage: { from: () => ({ upload }) } };
} }));
import { useAuthStore } from "../../stores/auth-store";
import { ConnectWorkspace } from "./connect-workspace";
import { ChatComposer } from "./chat-composer";
const context = { user_id: "user-a", tenant_id: "school-a", full_name: "Guru A", can_manage: true, font_size: 16 };
function mount(children: ReactNode) { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>); }
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
  useAuthStore.setState({ user: { id: "user-a" } as never });
  let font = 16;
  rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "oconnect_context") return { data: { ...context, font_size: font } };
    if (name === "oconnect_preferences") { font = args.font_size as number; return { data: null }; }
    return { data: [] };
  });
});
describe("O-Connect chat interaction", () => {
  it("saves the selected font and uses it again after remounting the account", async () => {
    const first = mount(<ConnectWorkspace/>);
    fireEvent.click(await screen.findByRole("button", { name: "Pengaturan chat" }));
    fireEvent.click(screen.getByRole("radio", { name: "Sangat besar" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Sangat besar" })).toBeChecked());
    expect(rpc).toHaveBeenCalledWith("oconnect_preferences", { font_size: 20 });
    first.unmount();
    mount(<ConnectWorkspace/>);
    fireEvent.click(await screen.findByRole("button", { name: "Pengaturan chat" }));
    expect(screen.getByRole("radio", { name: "Sangat besar" })).toBeChecked();
  });
  it("keeps a failed draft and retries with the same idempotency key", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "Network failed" } }).mockResolvedValue({ data: { id: "saved" } });
    mount(<ChatComposer context={context} conversation="conversation-a" reply={null} clearReply={() => {}} fontSize={20}/>);
    const input = screen.getByRole("textbox", { name: "Tulis pesan" });
    expect(input).toHaveStyle({ fontSize: "20px" });
    fireEvent.change(input, { target: { value: "Selamat pagi" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim pesan" }));
    fireEvent.click(await screen.findByRole("button", { name: "Kirim ulang" }));
    await waitFor(() => expect(input).toHaveValue(""));
    expect(rpc.mock.calls[0][1].message_id).toBe(rpc.mock.calls[1][1].message_id);
    expect(rpc.mock.calls[1][1].body).toBe("Selamat pagi");
  });
  it("rejects unsupported attachments before uploading", () => {
    mount(<ChatComposer context={context} conversation="conversation-a" reply={null} clearReply={() => {}} fontSize={16}/>);
    fireEvent.change(screen.getByLabelText("Pilih lampiran"), { target: { files: [new File(["<script>"], "attack.html", { type: "text/html" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("Pilih PNG");
    expect(upload).not.toHaveBeenCalled();
  });
});
