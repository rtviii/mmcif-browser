"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { type ParsedCif, parseCif } from "@/lib/cif";
import type { MolstarViewer as MolstarViewerInstance } from "@/lib/molstar/viewer";
import { useStore } from "@/lib/store";
import SourceInspector from "./cif/SourceInspector";

const MolstarViewer = dynamic(() => import("./MolstarViewer"), { ssr: false });

interface LoadedFile {
  data: string | Uint8Array;
  binary: boolean;
  name: string;
}

export default function CifInspector() {
  const init = useStore((s) => s.init);
  useEffect(() => {
    init();
  }, [init]);

  const [file, setFile] = useState<LoadedFile | null>(null);
  const [parsed, setParsed] = useState<ParsedCif | null>(null);
  const [blockIndex, setBlockIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdbId, setPdbId] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [viewer, setViewer] = useState<MolstarViewerInstance | null>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    parseCif(file.data, file.binary)
      .then((p) => {
        if (cancelled) return;
        setParsed(p);
        setBlockIndex(0);
      })
      .catch((e) => !cancelled && setError(e?.message ?? String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [file]);

  async function loadFile(f: File) {
    const binary = /\.bcif$/i.test(f.name);
    const buf = await f.arrayBuffer();
    setFile({
      data: binary ? new Uint8Array(buf) : new TextDecoder().decode(buf),
      binary,
      name: f.name,
    });
  }

  async function loadPdb() {
    const id = pdbId.trim().toLowerCase();
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`https://files.rcsb.org/download/${id}.cif`);
      if (!res.ok) throw new Error(`fetch ${id}: HTTP ${res.status}`);
      setFile({ data: await res.text(), binary: false, name: `${id}.cif` });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  const block = parsed?.blocks[blockIndex];

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) loadFile(f);
      }}
    >
      {/* toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-neutral-800 px-3 text-xs">
        <label className="cursor-pointer rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-200 hover:bg-neutral-800">
          Open file
          <input
            type="file"
            accept=".cif,.mmcif,.bcif"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
          />
        </label>
        <span className="text-neutral-600">or</span>
        <input
          value={pdbId}
          onChange={(e) => setPdbId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadPdb()}
          placeholder="PDB ID (e.g. 1cbs)"
          className="w-36 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100 placeholder-neutral-600 outline-none focus:border-sky-600"
        />
        <button
          onClick={loadPdb}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
        >
          Fetch
        </button>
        {file && <span className="font-mono text-neutral-400">{file.name}</span>}
        {block && (
          <span className="text-neutral-600">
            data_{block.header} · {block.categories.length} categories
          </span>
        )}
        {parsed && parsed.blocks.length > 1 && (
          <select
            value={blockIndex}
            onChange={(e) => setBlockIndex(Number(e.target.value))}
            className="rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-neutral-200"
          >
            {parsed.blocks.map((b, i) => (
              <option key={i} value={i}>
                {b.header}
              </option>
            ))}
          </select>
        )}
        {loading && <span className="text-neutral-500">loading…</span>}
        {error && <span className="text-rose-400">{error}</span>}
      </div>

      {/* body */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-r border-neutral-800">
          {!block ? (
            <div
              className={`m-3 flex flex-1 items-center justify-center rounded border border-dashed text-center text-xs ${
                dragOver ? "border-sky-600 text-sky-400" : "border-neutral-800 text-neutral-600"
              }`}
            >
              Drop a .cif / .mmcif / .bcif file here,
              <br />
              or open one / fetch a PDB ID above.
            </div>
          ) : (
            <SourceInspector file={file} parsed={parsed} viewer={viewer} />
          )}
        </div>

        <div className="min-w-0 flex-1 bg-black">
          <MolstarViewer data={file?.data ?? null} binary={file?.binary ?? false} onReady={setViewer} />
        </div>
      </div>
    </div>
  );
}
