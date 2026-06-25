import {
  QueryContext,
  Structure,
  StructureElement,
  StructureSelection,
} from "molstar/lib/mol-model/structure";
import { MolScriptBuilder as MS } from "molstar/lib/mol-script/language/builder";
import { compile } from "molstar/lib/mol-script/runtime/query/compiler";

// MolScript query builders + execution — the bridge between "a chain/residue id"
// and a Mol* loci you can highlight/focus. Ported from fend_tubulinxyz/queries.ts;
// fully generic (no tubulin assumptions).

export const buildChainQuery = (chainId: string) =>
  MS.struct.generator.atomGroups({
    "chain-test": MS.core.rel.eq([MS.ammp("auth_asym_id"), chainId]),
  });

export const buildMultiChainQuery = (chainIds: string[]) =>
  MS.struct.generator.atomGroups({
    "chain-test": MS.core.set.has([MS.set(...chainIds), MS.ammp("auth_asym_id")]),
  });

export const buildResidueQuery = (chainId: string, startResidue: number, endResidue?: number) => {
  const residueTest =
    endResidue !== undefined
      ? MS.core.rel.inRange([MS.ammp("auth_seq_id"), startResidue, endResidue])
      : MS.core.rel.eq([MS.ammp("auth_seq_id"), startResidue]);
  return MS.struct.generator.atomGroups({
    "chain-test": MS.core.rel.eq([MS.ammp("auth_asym_id"), chainId]),
    "residue-test": residueTest,
  });
};

export const buildMultiResidueQuery = (chainId: string, authSeqIds: number[]) =>
  MS.struct.generator.atomGroups({
    "chain-test": MS.core.rel.eq([MS.ammp("auth_asym_id"), chainId]),
    "residue-test": MS.core.set.has([MS.set(...authSeqIds), MS.ammp("auth_seq_id")]),
  });

export const buildEntityQuery = (entityId: string) =>
  MS.struct.generator.atomGroups({
    "chain-test": MS.core.rel.eq([MS.ammp("label_entity_id"), entityId]),
  });

export const buildSurroundingsQuery = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseQuery: any,
  radius = 5,
) =>
  MS.struct.modifier.includeSurroundings({
    0: baseQuery,
    radius,
    "as-whole-residues": true,
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const executeQuery = (query: any, structure: Structure): StructureElement.Loci | null => {
  const compiled = compile(query);
  const selection = compiled(new QueryContext(structure));
  if (StructureSelection.isEmpty(selection)) return null;
  return StructureSelection.toLociWithSourceUnits(selection);
};

export const structureToLoci = (structure: Structure): StructureElement.Loci =>
  Structure.toStructureElementLoci(structure);
