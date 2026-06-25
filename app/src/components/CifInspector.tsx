"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { fieldValues, type ParsedCif, parseCif } from "@/lib/cif";
import { useStore } from "@/lib/store";

const MolstarViewer = dynamic(() => import("./MolstarViewer"), { ssr: false });

interface LoadedFile {
  data: string | Uint8Array;
  binary: boolean;
  name: string;
}

type HoverTarget =
  | { kind: "category"; cat: string }
  | { kind: "item"; cat: string; field: string }
  | null;

export default function CifInspector() {
  const init = useStore((s) => s.init);
  const dict = useStore((s) => s.dict);
  useEffect(() => {
    init();
  }, [init]);

  const [file, setFile] = useState<LoadedFile | null>(null);
  const [parsed, setParsed] = useState<ParsedCif | null>(null);
  const [blockIndex, setBlockIndex] = useState(0);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<HoverTarget>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdbId, setPdbId] = useState("");
  const [dragOver, setDragOver] = useState(false);

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
        setOpenCats(new Set());
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
        <div className="flex w-[460px] shrink-0 flex-col border-r border-neutral-800">
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
            <>
              <div className="min-h-0 flex-1 overflow-y-auto py-1">
                {block.categories.map((c) => {
                  const open = openCats.has(c.name);
                  const inDict = !!dict?.categories[c.name];
                  return (
                    <div key={c.name}>
                      <button
                        className="flex w-full items-center gap-1.5 px-3 py-1 text-left hover:bg-neutral-800/50"
                        onClick={() =>
                          setOpenCats((s) => {
                            const n = new Set(s);
                            n.has(c.name) ? n.delete(c.name) : n.add(c.name);
                            return n;
                          })
                        }
                        onMouseEnter={() => setHover({ kind: "category", cat: c.name })}
                      >
                        <span className="text-[9px] text-neutral-600">{open ? "▼" : "▶"}</span>
                        <span
                          className={`flex-1 truncate font-mono text-[12px] ${
                            inDict ? "text-neutral-100" : "text-amber-300"
                          }`}
                          title={inDict ? undefined : "not in dictionary"}
                        >
                          {c.name}
                        </span>
                        <span className="font-mono text-[9px] text-neutral-500">{c.rowCount}</span>
                      </button>
                      {open && (
                        <div className="pb-1">
                          {c.fieldNames.map((f) => {
                            const itemName = `_${c.name}.${f}`;
                            const it = dict?.items[itemName];
                            const sample = parsed ? fieldValues(parsed, blockIndex, c.name, f, 1)[0] : "";
                            return (
                              <div
                                key={f}
                                className="flex items-center gap-2 py-0.5 pl-7 pr-3 hover:bg-neutral-800/40"
                                onMouseEnter={() => setHover({ kind: "item", cat: c.name, field: f })}
                              >
                                <span
                                  className={`truncate font-mono text-[11px] ${
                                    it ? "text-neutral-300" : "text-amber-300/80"
                                  }`}
                                >
                                  {f}
                                </span>
                                {it?.mandatory === "yes" && (
                                  <span className="text-[8px] text-rose-400">req</span>
                                )}
                                {it?.type && (
                                  <span className="rounded bg-neutral-800 px-1 text-[8px] text-neutral-400">
                                    {it.type}
                                  </span>
                                )}
                                <span className="ml-auto max-w-[44%] truncate font-mono text-[10px] text-neutral-500">
                                  {sample}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <Definition hover={hover} />
            </>
          )}
        </div>

        <div className="min-w-0 flex-1 bg-black">
          <MolstarViewer data={file?.data ?? null} binary={file?.binary ?? false} />
        </div>
      </div>
    </div>
  );
}

function Definition({ hover }: { hover: HoverTarget }) {
  const dict = useStore((s) => s.dict);
  const content = useMemo(() => {
    if (!dict || !hover) return null;
    if (hover.kind === "category") {
      const c = dict.categories[hover.cat];
      if (!c) return { title: hover.cat, body: null, note: "Not defined in the PDBx/mmCIF dictionary." };
      return { title: c.name, body: c.description, type: null, enums: null, group: c.groups.join(", ") };
    }
    const it = dict.items[`_${hover.cat}.${hover.field}`];
    if (!it) return { title: `_${hover.cat}.${hover.field}`, body: null, note: "Not defined in the PDBx/mmCIF dictionary." };
    const t = it.type ? dict.types[it.type] : null;
    return {
      title: it.name,
      body: it.description,
      type: t ? `${t.code} (${t.primitive})` : it.type,
      enums: it.enums ?? null,
      mandatory: it.mandatory,
      units: it.units,
    };
  }, [dict, hover]);

  return (
    <div className="h-44 shrink-0 overflow-y-auto border-t border-neutral-800 bg-neutral-900/50 p-3">
      {!content ? (
        <div className="text-[11px] text-neutral-600">Hover a category or item for its definition.</div>
      ) : (
        <>
          <div className="font-mono text-[12px] text-neutral-100">{content.title}</div>
          <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] text-neutral-500">
            {"type" in content && content.type && <span>type: {content.type}</span>}
            {"mandatory" in content && content.mandatory && <span>mandatory: {content.mandatory}</span>}
            {"units" in content && content.units && <span>units: {content.units}</span>}
            {"group" in content && content.group && <span>groups: {content.group}</span>}
          </div>
          {"note" in content && content.note && (
            <div className="mt-1 text-[11px] text-amber-300/90">{content.note}</div>
          )}
          {content.body && (
            <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-neutral-300">
              {content.body}
            </p>
          )}
          {"enums" in content && content.enums && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {content.enums.map(([v]) => (
                <span key={v} className="rounded bg-sky-500/10 px-1 font-mono text-[10px] text-sky-300">
                  {v}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
