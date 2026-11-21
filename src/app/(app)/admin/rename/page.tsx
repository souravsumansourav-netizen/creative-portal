"use client";
import { useMemo, useRef, useState } from "react";
import { Zip, ZipPassThrough } from "fflate";
import { saveBlob } from "@/lib/api";
import { btn, btnGhost, Card, Empty, Msg, PageHeader } from "@/components/ui";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|tiff?|bmp)$/i;
const IGNORED = new Set([".ds_store", "thumbs.db", "desktop.ini"]);

type Row = { file: File; path: string; original: string; renamed: string; changed: boolean; deduped: boolean };

/** "4jklm.jpg" -> "4JKLM.jpg": the name goes to capitals, the extension to lower case. */
function capsName(name: string): string {
  const n = name.trim();
  const dot = n.lastIndexOf(".");
  return dot > 0 ? `${n.slice(0, dot).toUpperCase()}${n.slice(dot).toLowerCase()}` : n.toUpperCase();
}

/** Build the rename plan. Two files that would end up with the same name get _2, _3… so none is lost. */
function plan(files: { file: File; path: string }[]): Row[] {
  const used = new Set<string>();
  return files.map(({ file, path }) => {
    const base = capsName(file.name);
    let renamed = base;
    let n = 1;
    while (used.has(renamed)) {
      n++;
      const dot = base.lastIndexOf(".");
      renamed = dot > 0 ? `${base.slice(0, dot)}_${n}${base.slice(dot)}` : `${base}_${n}`;
    }
    used.add(renamed);
    return { file, path, original: file.name, renamed, changed: renamed !== file.name, deduped: renamed !== base };
  });
}

// ----- reading dropped folders (drag & drop) -----
async function readAllEntries(dir: any): Promise<any[]> {
  const reader = dir.createReader();
  const out: any[] = [];
  for (;;) {
    const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
    if (!batch.length) return out;
    out.push(...batch);
  }
}
async function walk(entry: any, prefix: string, out: { file: File; path: string }[]) {
  if (entry.isFile) {
    const file: File = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ file, path: `${prefix}${file.name}` });
  } else if (entry.isDirectory) {
    for (const child of await readAllEntries(entry)) await walk(child, `${prefix}${entry.name}/`, out);
  }
}

export default function RenameImagesPage() {
  const [items, setItems] = useState<{ file: File; path: string }[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [progress, setProgress] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => plan(items), [items]);
  const totalBytes = items.reduce((n, i) => n + i.file.size, 0);
  const changed = rows.filter((r) => r.changed).length;
  const deduped = rows.filter((r) => r.deduped).length;

  function load(list: { file: File; path: string }[]) {
    const images = list.filter(({ file }) => IMAGE_EXT.test(file.name) && !IGNORED.has(file.name.toLowerCase()));
    setSkipped(list.length - images.length);
    setItems(images);
    setMsg({});
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault(); setOver(false);
    const out: { file: File; path: string }[] = [];
    const entries = [...e.dataTransfer.items].map((i) => (i as any).webkitGetAsEntry?.()).filter(Boolean);
    if (entries.length) for (const en of entries) await walk(en, "", out);
    else for (const f of e.dataTransfer.files) out.push({ file: f, path: f.name });
    load(out);
  }

  async function download() {
    setMsg({});
    try {
      const chunks: BlobPart[] = [];
      await new Promise<void>((resolve, reject) => {
        const zip = new Zip((err, chunk, final) => {
          if (err) return reject(err);
          chunks.push(chunk as BlobPart);
          if (final) resolve();
        });
        (async () => {
          for (let i = 0; i < rows.length; i++) {
            const buf = new Uint8Array(await rows[i].file.arrayBuffer());
            const entry = new ZipPassThrough(rows[i].renamed); // images are already compressed: store, don't deflate
            zip.add(entry);
            entry.push(buf, true);
            setProgress(`Zipping ${i + 1} of ${rows.length}…`);
          }
          zip.end();
        })().catch(reject);
      });
      const stamp = new Date().toISOString().slice(0, 10);
      saveBlob(new Blob(chunks, { type: "application/zip" }), `renamed_images_${stamp}.zip`);
      setMsg({ ok: `Downloaded ${rows.length} image${rows.length === 1 ? "" : "s"} with capital-letter names.` });
    } catch (e) {
      setMsg({ error: `Couldn't build the ZIP: ${(e as Error).message}. For very large folders, try a smaller batch.` });
    }
    setProgress(null);
  }

  const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`);

  return (
    <>
      <PageHeader title="Rename images" sub="File names go to capitals: 4jklm.jpg becomes 4JKLM.jpg." />
      <Msg error={msg.error} ok={msg.ok} />

      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`mb-5 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${over ? "border-maroon-500 bg-maroon-50" : "border-stone-300 bg-white"}`}
      >
        <p className="text-xl font-semibold tracking-[-0.018em] text-maroon-800">Drop a folder of images here</p>
        <p className="mt-1 text-sm text-stone-500">or choose one below. Subfolders are included. Everything stays on your computer: nothing is uploaded.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <input ref={folderRef} type="file" multiple className="hidden"
            {...({ webkitdirectory: "", directory: "" } as any)}
            onChange={(e) => { load([...(e.target.files ?? [])].map((f) => ({ file: f, path: (f as any).webkitRelativePath || f.name }))); e.target.value = ""; }} />
          <input ref={filesRef} type="file" multiple accept="image/*" className="hidden"
            onChange={(e) => { load([...(e.target.files ?? [])].map((f) => ({ file: f, path: f.name }))); e.target.value = ""; }} />
          <button className={btn} onClick={() => folderRef.current?.click()}>Choose folder</button>
          <button className={btnGhost} onClick={() => filesRef.current?.click()}>Choose files</button>
        </div>
      </div>

      {!rows.length ? <Empty>No images selected yet.</Empty> : (
        <>
          <Card className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span><b>{rows.length}</b> images · {mb(totalBytes)}</span>
            <span><b>{changed}</b> will be renamed</span>
            <span className="text-stone-500">{rows.length - changed} already in capitals</span>
            {deduped > 0 && <span className="text-ink-orange">{deduped} duplicate name{deduped > 1 ? "s" : ""} got a _2 / _3 suffix</span>}
            {skipped > 0 && <span className="text-stone-500">{skipped} non-image file{skipped > 1 ? "s" : ""} skipped</span>}
            <span className="flex-1" />
            <button className={btnGhost} disabled={!!progress} onClick={() => { setItems([]); setSkipped(0); setMsg({}); }}>Clear</button>
            <button className={btn} disabled={!!progress} onClick={download}>{progress ?? `Download ZIP (${rows.length})`}</button>
          </Card>
          {totalBytes > 1.5e9 && <Msg error="This folder is over 1.5 GB. Building the ZIP in the browser may run out of memory. Split it into smaller folders if it fails." />}

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-black/[0.025] text-left text-stone-500"><tr><th className="p-2">Original</th><th>New name</th><th /></tr></thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className="border-t border-black/[0.05]">
                    <td className="p-2 text-stone-600">{r.path}</td>
                    <td className="font-medium">{r.renamed}</td>
                    <td className="pr-3 text-right text-xs">
                      {r.deduped ? <span className="text-ink-orange">duplicate</span> : r.changed ? <span className="text-ink-green">renamed</span> : <span className="text-stone-400">unchanged</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 && <p className="border-t border-black/[0.05] p-2 text-center text-xs text-stone-500">Showing the first 200 of {rows.length}. All {rows.length} go into the ZIP.</p>}
          </Card>
        </>
      )}
    </>
  );
}
