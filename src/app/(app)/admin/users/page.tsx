"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLiveData } from "@/lib/hooks";
import { Card, Empty, input, Msg, PageHeader } from "@/components/ui";
import { ROLES } from "@/lib/constants";

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
      {loading ? <p className="text-sm text-stone-500">Loading…</p> : !users.length ? <Empty>No users.</Empty> : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-500"><tr><th className="p-2">Name</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-stone-100">
                  <td className="p-2">{u.full_name || "—"}</td><td>{u.email}</td>
                  <td>
                    <select className={input} value={u.role} onChange={(e) => setRole(u.id, e.target.value)}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
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
