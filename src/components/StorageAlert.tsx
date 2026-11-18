"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { rpc } from "@/lib/api";
import { formatBytes, STORAGE_ALERT_BYTES, STORAGE_LIMIT_BYTES } from "@/lib/constants";

/** Admin-only banner: shown on every page once stored images reach 9 GB of the 10 GB free tier. */
export function StorageAlert() {
  const [used, setUsed] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    const check = () => rpc<number>("storage_used_bytes", {}).then((n) => live && setUsed(Number(n))).catch(() => {});
    check();
    const t = setInterval(check, 60_000);
    return () => { live = false; clearInterval(t); };
  }, []);

  if (used === null || used < STORAGE_ALERT_BYTES) return null;
  const over = used >= STORAGE_LIMIT_BYTES;
  return (
    <div role="alert" className="border-b border-red-300 bg-red-600 px-4 py-2 text-center text-sm text-white">
      <b>{over ? "Storage limit reached" : "Storage almost full"}:</b> {formatBytes(used)} of {formatBytes(STORAGE_LIMIT_BYTES)} used.
      {" "}Delete finished batches to avoid overage charges.{" "}
      <Link href="/admin/batches" className="font-semibold underline">Manage batches →</Link>
    </div>
  );
}
