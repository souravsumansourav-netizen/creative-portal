"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLiveData } from "@/lib/hooks";
import { Card, Empty, input, Msg, PageHeader } from "@/components/ui";
import { ROLES } from "@/lib/constants";
import { Select } from "@/components/controls";
import { TableSkeleton } from "@/components/controls";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});

  const { loading, error: loadError, reload } = useLiveData(async () => {
    const { data, error } = await supabaseBrowser().from("profiles").select("*").order("created_at");
    if (error) throw error;
    setUsers(data ?? []);
  }, []);

  async function setRole(id: string, role: string) {
    setMsg({});
    const { error } = await supabaseBrowser().from("profiles").update({ role }).eq("id", id);
    if (error) setMsg({ error: error.message }); else { setMsg({ ok: "Role updated." }); reload(); }
  }

  return (
    <>
      <PageHeader title="Users" sub="People choose their role when they sign up. Change it here." />
      <Msg error={msg.error ?? loadError} ok={msg.ok} />
      {loading ? <TableSkeleton /> : !users.length ? <Empty>No users yet</Empty> : (
        <Card className="divide-y divide-black/[0.06] p-0">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-4 px-5 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-[0.75rem] font-semibold text-stone-700">
                {(u.full_name || u.email || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.9375rem] font-medium text-stone-900">{u.full_name || "No name"}</p>
                <p className="truncate text-sm text-stone-500">{u.email}</p>
              </div>
              <Select className={`${input} w-44`} value={u.role} onChange={(e) => setRole(u.id, e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
              </Select>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
