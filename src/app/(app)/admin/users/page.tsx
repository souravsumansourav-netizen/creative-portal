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
      <PageHeader title="Users" sub="New sign-ups default to 'creator' (the very first user becomes admin)." />
      <Msg error={msg.error ?? loadError} ok={msg.ok} />
      {loading ? <TableSkeleton /> : !users.length ? <Empty>No users.</Empty> : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.025] text-left text-stone-500"><tr><th className="p-2">Name</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-black/[0.05]">
                  <td className="p-2">{u.full_name || "—"}</td><td>{u.email}</td>
                  <td>
                    <Select className={input} value={u.role} onChange={(e) => setRole(u.id, e.target.value)}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
