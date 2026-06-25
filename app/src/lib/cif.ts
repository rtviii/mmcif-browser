import { CIF } from "molstar/lib/mol-io/reader/cif";

// Thin wrapper around Mol*'s CIF/BinaryCIF reader, used to drive the inspector's
// category tree. Mol* parses categories as `atom_site` with fields `Cartn_x`, which
// map directly onto our dictionary keys (`atom_site` / `_atom_site.Cartn_x`).

export interface CifCategoryView {
  name: string;
  rowCount: number;
  fieldNames: string[];
}

export interface CifBlockView {
  header: string;
  categories: CifCategoryView[];
}

// Keep the raw Mol* CifFile around for on-demand value lookups (avoids materialising
// every cell up front for huge loops like atom_site).
export interface ParsedCif {
  blocks: CifBlockView[];
  raw: unknown;
}

export async function parseCif(data: string | Uint8Array, binary: boolean): Promise<ParsedCif> {
  const parsed = binary
    ? CIF.parseBinary(data as Uint8Array)
    : CIF.parseText(data as string);
  const ret = await parsed.run();
  if (ret.isError) throw new Error(ret.message);
  const file = ret.result;

  const blocks: CifBlockView[] = file.blocks.map((b) => ({
    header: b.header,
    categories: b.categoryNames
      .map((name) => {
        const c = b.categories[name];
        return { name, rowCount: c.rowCount, fieldNames: [...c.fieldNames] };
      })
      .sort((a, z) => a.name.localeCompare(z.name)),
  }));

  return { blocks, raw: file };
}

// Pull up to `max` sample values for a single field, formatted as strings.
export function fieldValues(
  parsed: ParsedCif,
  blockIndex: number,
  category: string,
  field: string,
  max = 8,
): string[] {
  const file = parsed.raw as {
    blocks: { categories: Record<string, { getField: (n: string) => { str: (r: number) => string } | undefined; rowCount: number }> }[];
  };
  const cat = file.blocks[blockIndex]?.categories[category];
  const f = cat?.getField(field);
  if (!cat || !f) return [];
  const n = Math.min(max, cat.rowCount);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(f.str(i));
  return out;
}
