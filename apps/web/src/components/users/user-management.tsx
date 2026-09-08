"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { createClient } from "../../lib/supabase/client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Input } from "../ui/input";
import { Modal } from "../ui/modal";
import { Select } from "../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
} from "../ui/table";
import { useToast } from "../ui/toast";

interface UserLevel {
  code: string;
  id: string;
  name: string;
}

interface UserRecord {
  created_at: string;
  email: string | null;
  full_name: string | null;
  id: string;
  is_active: boolean;
  tenant_id: string;
  updated_at: string;
  user_level_id: string | null;
  user_levels: UserLevel | UserLevel[] | null;
}

interface UserList {
  items: UserRecord[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

interface ApiSuccessResponse<T> {
  data: T;
  success: true;
}

interface ApiErrorResponse {
  error?: {
    message?: string | string[];
  };
  success?: false;
}

interface UserForm {
  email: string;
  full_name: string;
  user_level_id: string;
}

const emptyForm: UserForm = {
  email: "",
  full_name: "",
  user_level_id: "",
};

function apiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL;

  if (!url) {
    throw new Error("Public API configuration is missing");
  }

  return url.replace(/\/$/, "");
}

async function requestApi<T>(path: string, init?: RequestInit) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new Error("Authenticated session is unavailable");
  }

  const response = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(init?.body && { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as
    | ApiSuccessResponse<T>
    | ApiErrorResponse;

  if (!response.ok || !("data" in payload)) {
    const rawMessage =
      "error" in payload ? payload.error?.message : undefined;
    throw new Error(
      Array.isArray(rawMessage)
        ? rawMessage.join(", ")
        : rawMessage ?? "API request failed",
    );
  }

  return payload.data;
}

export function userLevelFor(user: UserRecord) {
  return Array.isArray(user.user_levels)
    ? user.user_levels[0] ?? null
    : user.user_levels;
}

export function UserManagement({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [emailDraft, setEmailDraft] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [editingUser, setEditingUser] = useState<UserRecord>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [formError, setFormError] = useState<string>();

  const queryString = new URLSearchParams({
    page: String(page),
    page_size: "20",
    ...(email && { email }),
    ...(status && { status }),
  });

  const usersQuery = useQuery({
    placeholderData: keepPreviousData,
    queryFn: () =>
      requestApi<UserList>(`/users?${queryString.toString()}`),
    queryKey: ["users", page, email, status],
  });

  const levelsQuery = useQuery({
    queryFn: () =>
      requestApi<UserLevel[]>("/users/meta/user-levels"),
    queryKey: ["user-levels"],
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      userId,
      values,
    }: {
      userId?: string;
      values: UserForm;
    }) =>
      requestApi<UserRecord>(
        userId ? `/users/${userId}` : "/users",
        {
          body: JSON.stringify(values),
          method: userId ? "PATCH" : "POST",
        },
      ),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      setIsFormOpen(false);
      setEditingUser(undefined);
      setForm(emptyForm);
      toast({
        description: "The Auth account and Core profile are synchronized.",
        title: variables.userId ? "User updated" : "User created",
        tone: "success",
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      isActive,
      userId,
    }: {
      isActive: boolean;
      userId: string;
    }) =>
      requestApi<UserRecord>(`/users/${userId}/status`, {
        body: JSON.stringify({ is_active: isActive }),
        method: "PATCH",
      }),
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({
        description: user.is_active
          ? "The account can authenticate again."
          : "The account is blocked from authentication.",
        title: user.is_active ? "User activated" : "User deactivated",
        tone: "success",
      });
    },
  });

  function openCreate() {
    setEditingUser(undefined);
    setForm({
      ...emptyForm,
      user_level_id: levelsQuery.data?.[0]?.id ?? "",
    });
    setFormError(undefined);
    setIsFormOpen(true);
  }

  function openEdit(user: UserRecord) {
    setEditingUser(user);
    setForm({
      email: user.email ?? "",
      full_name: user.full_name ?? "",
      user_level_id: user.user_level_id ?? "",
    });
    setFormError(undefined);
    setIsFormOpen(true);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);

    try {
      await saveMutation.mutateAsync({
        userId: editingUser?.id,
        values: form,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save user";
      setFormError(message);
      toast({ title: message, tone: "error" });
    }
  }

  async function changeStatus(user: UserRecord) {
    const nextStatus = !user.is_active;
    const action = nextStatus ? "activate" : "deactivate";

    if (!window.confirm(`Are you sure you want to ${action} this user?`)) {
      return;
    }

    try {
      await statusMutation.mutateAsync({
        isActive: nextStatus,
        userId: user.id,
      });
    } catch (error) {
      toast({
        title:
          error instanceof Error
            ? error.message
            : "Unable to update user status",
        tone: "error",
      });
    }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setEmail(emailDraft.trim().toLowerCase());
  }

  const list = usersQuery.data;

  return (
    <>
      <section className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="info">Tenant isolated</Badge>
          <h1 className="mt-3 text-4xl font-black tracking-tight">
            User management
          </h1>
          <p className="mt-2 max-w-2xl text-muted">
            Manage Auth accounts and Core user profiles inside your school.
          </p>
        </div>
        <Button
          disabled={levelsQuery.isLoading || Boolean(levelsQuery.error)}
          onClick={openCreate}
        >
          Add user
        </Button>
      </section>

      <Card className="mt-6">
        <form
          className="grid gap-3 md:grid-cols-[1fr_12rem_auto]"
          onSubmit={applyFilters}
        >
          <Input
            label="Search email"
            name="email-filter"
            onChange={(event) => setEmailDraft(event.target.value)}
            placeholder="name@school.example"
            type="search"
            value={emailDraft}
          />
          <Select
            label="Status"
            name="status-filter"
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            value={status}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <Button className="self-end" type="submit" variant="secondary">
            Apply filters
          </Button>
        </form>
      </Card>

      <section className="mt-4">
        {usersQuery.isLoading && (
          <Card className="text-sm text-muted">Loading users…</Card>
        )}

        {usersQuery.error && (
          <EmptyState
            action={
              <Button onClick={() => usersQuery.refetch()}>
                Try again
              </Button>
            }
            description={
              usersQuery.error instanceof Error
                ? usersQuery.error.message
                : "Unable to load the tenant user master."
            }
            title="Users unavailable"
          />
        )}

        {list && list.items.length === 0 && (
          <EmptyState
            action={<Button onClick={openCreate}>Add first user</Button>}
            description="No users match the current tenant filters."
            title="No users found"
          />
        )}

        {list && list.items.length > 0 && (
          <Card className="p-0">
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>User</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {list.items.map((user) => {
                  const level = userLevelFor(user);
                  const isCurrentUser = user.id === currentUserId;

                  return (
                    <tr key={user.id}>
                      <TableCell>
                        <p className="font-semibold">
                          {user.full_name || "Unnamed user"}
                          {isCurrentUser && (
                            <span className="ml-2 text-xs text-muted">
                              You
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {user.email ?? "No email"}
                        </p>
                      </TableCell>
                      <TableCell>
                        {level ? (
                          <div>
                            <p className="font-medium">{level.name}</p>
                            <p className="mt-1 font-mono text-xs text-muted">
                              {level.code}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge tone={user.is_active ? "success" : "danger"}>
                          {user.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            onClick={() => openEdit(user)}
                            size="sm"
                            variant="ghost"
                          >
                            Edit
                          </Button>
                          <Button
                            disabled={
                              isCurrentUser ||
                              (statusMutation.isPending &&
                                statusMutation.variables?.userId === user.id)
                            }
                            onClick={() => changeStatus(user)}
                            size="sm"
                            variant={user.is_active ? "danger" : "secondary"}
                          >
                            {user.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </TableCell>
                    </tr>
                  );
                })}
              </TableBody>
            </Table>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
              <p className="text-muted">
                {list.pagination.total} user
                {list.pagination.total === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  disabled={list.pagination.page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                  size="sm"
                  variant="ghost"
                >
                  Previous
                </Button>
                <span>
                  Page {list.pagination.page} of{" "}
                  {list.pagination.total_pages}
                </span>
                <Button
                  disabled={
                    list.pagination.page >= list.pagination.total_pages
                  }
                  onClick={() => setPage((current) => current + 1)}
                  size="sm"
                  variant="ghost"
                >
                  Next
                </Button>
              </div>
            </footer>
          </Card>
        )}
      </section>

      <Modal
        description="The account stays inside the current tenant."
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingUser ? "Edit user" : "Add user"}
      >
        <form className="grid gap-4" onSubmit={submitForm}>
          <Input
            label="Full name"
            maxLength={160}
            minLength={2}
            name="full_name"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                full_name: event.target.value,
              }))
            }
            required
            value={form.full_name}
          />
          <Input
            label="Email"
            maxLength={320}
            name="email"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
            required
            type="email"
            value={form.email}
          />
          <Select
            label="User level"
            name="user_level_id"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                user_level_id: event.target.value,
              }))
            }
            required
            value={form.user_level_id}
          >
            <option disabled value="">
              Select a user level
            </option>
            {levelsQuery.data?.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name} ({level.code})
              </option>
            ))}
          </Select>
          {formError && (
            <p className="text-sm text-danger" role="alert">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => setIsFormOpen(false)}
              variant="ghost"
            >
              Cancel
            </Button>
            <Button disabled={saveMutation.isPending} type="submit">
              {saveMutation.isPending ? "Saving…" : "Save user"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
