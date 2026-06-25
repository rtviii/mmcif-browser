import { Vec3 } from "molstar/lib/mol-math/linear-algebra/3d/vec3";
import { Vec4 } from "molstar/lib/mol-math/linear-algebra/3d/vec4";
import {
  Structure,
  StructureElement,
  StructureProperties,
} from "molstar/lib/mol-model/structure";
import { createPluginUI } from "molstar/lib/mol-plugin-ui";
import { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { renderReact18 } from "molstar/lib/mol-plugin-ui/react18";
import { PluginUISpec } from "molstar/lib/mol-plugin-ui/spec";
import { PluginCommands } from "molstar/lib/mol-plugin/commands";
import { StateSelection } from "molstar/lib/mol-state";
import { Color } from "molstar/lib/mol-util/color";
import { viewerSpec } from "./spec";

export interface PickInfo {
  chainId: string;
  authSeqId: number;
  compId: string;
  position3d?: [number, number, number];
}

/**
 * Pure Mol* wrapper — owns the plugin lifecycle and exposes low-level operations
 * (load / highlight / focus / select / subscribe). No React, no app state. Adapted
 * from the fend_tubulinxyz `MolstarViewer`, generalised for arbitrary structures.
 */
export class MolstarViewer {
  ctx: PluginUIContext | null = null;
  private initPromise: Promise<void> | null = null;

  async init(container: HTMLElement, spec: PluginUISpec = viewerSpec): Promise<void> {
    if (this.ctx) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit(container, spec);
    return this.initPromise;
  }

  private async doInit(container: HTMLElement, spec: PluginUISpec): Promise<void> {
    this.ctx = await createPluginUI({ target: container, spec, render: renderReact18 });
    this.applyDefaultStyling();
  }

  private applyDefaultStyling(): void {
    // match the app's dark theme instead of Mol*'s default white canvas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.ctx?.canvas3d?.setProps({ renderer: { backgroundColor: Color(0x0a0a0a) } } as any);
  }

  handleResize(): void {
    this.ctx?.canvas3d?.handleResize();
  }

  // --- data loading (parses + applies Mol*'s default representation preset) ---

  async load(data: string | Uint8Array, opts: { label?: string } = {}): Promise<void> {
    if (!this.ctx) throw new Error("Viewer not initialized");
    const raw = await this.ctx.builders.data.rawData({
      data: data as string | Uint8Array<ArrayBuffer>,
      label: opts.label,
    });
    if (!this.ctx) throw new Error("Viewer disposed during load");
    const trajectory = await this.ctx.builders.structure.parseTrajectory(raw, "mmcif");
    if (!this.ctx) throw new Error("Viewer disposed during load");
    await this.ctx.builders.structure.hierarchy.applyPreset(trajectory, "default");
  }

  async loadFromUrl(url: string, opts: { binary?: boolean; label?: string } = {}): Promise<void> {
    if (!this.ctx) throw new Error("Viewer not initialized");
    const raw = await this.ctx.builders.data.download({
      url,
      isBinary: !!opts.binary,
      label: opts.label,
    });
    if (!this.ctx) throw new Error("Viewer disposed during load");
    const trajectory = await this.ctx.builders.structure.parseTrajectory(raw, "mmcif");
    if (!this.ctx) throw new Error("Viewer disposed during load");
    await this.ctx.builders.structure.hierarchy.applyPreset(trajectory, "default");
  }

  async clear(): Promise<void> {
    if (!this.ctx) return;
    await PluginCommands.State.RemoveObject(this.ctx, {
      state: this.ctx.state.data,
      ref: this.ctx.state.data.tree.root.ref,
      removeParentGhosts: true,
    });
  }

  // --- camera ---

  resetCamera(durationMs = 250): void {
    if (!this.ctx) return;
    PluginCommands.Camera.Reset(this.ctx, { durationMs });
  }

  // --- structure access (for building queries) ---

  getCurrentStructure(): Structure | undefined {
    return this.ctx?.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
  }

  getStructureFromRef(ref: string): Structure | undefined {
    if (!this.ctx) return undefined;
    const cell = this.ctx.state.data.select(StateSelection.Generators.byRef(ref))[0];
    return cell?.obj?.data as Structure | undefined;
  }

  // --- highlight / focus / selection ---

  highlightLoci(loci: StructureElement.Loci | null): void {
    if (!this.ctx) return;
    if (!loci || StructureElement.Loci.isEmpty(loci)) {
      this.ctx.managers.interactivity.lociHighlights.clearHighlights();
    } else {
      this.ctx.managers.interactivity.lociHighlights.highlight({ loci }, false);
    }
  }

  focusLoci(loci: StructureElement.Loci, durationMs = 250): void {
    if (!this.ctx || StructureElement.Loci.isEmpty(loci)) return;
    this.ctx.managers.camera.focusLoci(loci, { durationMs });
  }

  setFocusFromLoci(loci: StructureElement.Loci): void {
    this.ctx?.managers.structure.focus.setFromLoci(loci);
  }

  clearFocus(): void {
    this.ctx?.managers.structure.focus.clear();
  }

  clearSelection(): void {
    this.ctx?.managers.interactivity.lociSelects.deselectAll();
    this.ctx?.managers.structure.selection.clear();
  }

  setSelection(loci: StructureElement.Loci): void {
    this.ctx?.managers.structure.selection.fromLoci("set", loci);
  }

  addToSelection(loci: StructureElement.Loci): void {
    this.ctx?.managers.structure.selection.fromLoci("add", loci);
  }

  // --- interaction events ---

  subscribeToHover(callback: (info: PickInfo | null) => void): () => void {
    if (!this.ctx) return () => {};
    const sub = this.ctx.behaviors.interaction.hover.subscribe((e) => callback(pickFromLoci(e)));
    return () => sub.unsubscribe();
  }

  subscribeToClick(callback: (info: PickInfo | null) => void): () => void {
    if (!this.ctx) return () => {};
    const sub = this.ctx.behaviors.interaction.click.subscribe((e) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((e as any).button === 2) return; // ignore right-click (context menu)
      callback(pickFromLoci(e));
    });
    return () => sub.unsubscribe();
  }

  // --- 3D -> screen projection (for DOM labels anchored to atoms) ---

  projectToScreen(position3d: [number, number, number]): { x: number; y: number } | null {
    const canvas3d = this.ctx?.canvas3d;
    if (!canvas3d) return null;
    const camera = canvas3d.camera;
    const viewport = camera.viewport;
    const point = Vec3.create(position3d[0], position3d[1], position3d[2]);
    const projected = Vec4.create(0, 0, 0, 0);
    camera.project(projected, point);
    const canvasEl = canvas3d.webgl.gl.canvas;
    const rect = canvasEl instanceof HTMLElement ? canvasEl.getBoundingClientRect() : null;
    if (!rect) return null;
    const scale = viewport.width / rect.width;
    return {
      x: projected[0] / scale + rect.left + window.scrollX,
      y: (viewport.height - projected[1]) / scale + rect.top + window.scrollY,
    };
  }

  subscribeToDidDraw(callback: () => void): () => void {
    const canvas3d = this.ctx?.canvas3d;
    if (!canvas3d) return () => {};
    const sub = canvas3d.didDraw.subscribe(callback);
    return () => sub.unsubscribe();
  }

  dispose(): void {
    this.ctx?.dispose();
    this.ctx = null;
    this.initPromise = null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickFromLoci(e: any): PickInfo | null {
  const loci = e?.current?.loci;
  if (!StructureElement.Loci.is(loci) || StructureElement.Loci.isEmpty(loci)) return null;
  let info: PickInfo | null = null;
  StructureElement.Loci.forEachLocation(loci, (location) => {
    if (info) return;
    info = {
      chainId: StructureProperties.chain.auth_asym_id(location),
      authSeqId: StructureProperties.residue.auth_seq_id(location),
      compId: StructureProperties.atom.label_comp_id(location),
      position3d: e.position
        ? [e.position[0], e.position[1], e.position[2]]
        : [
            StructureProperties.atom.x(location),
            StructureProperties.atom.y(location),
            StructureProperties.atom.z(location),
          ],
    };
  });
  return info;
}
