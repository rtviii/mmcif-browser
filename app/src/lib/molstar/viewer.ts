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
import type { Color } from "molstar/lib/mol-util/color";
import { LabelManager } from "./labels";
import { viewerSpec } from "./spec";
import { BALL_AND_STICK_COMPONENTS, STYLIZED_POSTPROCESSING, WHITE_BACKGROUND } from "./style";

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
  private labelManager: LabelManager | null = null;

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
    if (!this.ctx) return;
    // Illustrative look (à la fend_tubulinxyz): white canvas + outline + ambient occlusion,
    // and a flat (unlit) material on every representation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.ctx.canvas3d?.setProps({
      postprocessing: STYLIZED_POSTPROCESSING,
      renderer: { backgroundColor: WHITE_BACKGROUND },
      // Never let an implicit scene change (e.g. adding a representation) auto-refit the camera.
      // The camera only moves on the explicit resetCamera() after load and focusLoci() on pin.
      camera: { manualReset: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    this.ctx.managers.structure.component.setOptions({
      ...this.ctx.managers.structure.component.state.options,
      ignoreLight: true,
    });
  }

  handleResize(): void {
    this.ctx?.canvas3d?.handleResize();
  }

  // --- data loading (parses + applies a flat ball-and-stick representation) ---

  async load(data: string | Uint8Array, opts: { label?: string } = {}): Promise<void> {
    if (!this.ctx) throw new Error("Viewer not initialized");
    const raw = await this.ctx.builders.data.rawData({
      data: data as string | Uint8Array<ArrayBuffer>,
      label: opts.label,
    });
    if (!this.ctx) throw new Error("Viewer disposed during load");
    const trajectory = await this.ctx.builders.structure.parseTrajectory(raw, "mmcif");
    if (!this.ctx) throw new Error("Viewer disposed during load");
    await this.buildBallAndStick(trajectory);
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
    await this.buildBallAndStick(trajectory);
  }

  // Build the structure and render every non-solvent component as flat ball-and-stick
  // (the user's default look) rather than Mol*'s cartoon-based preset.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async buildBallAndStick(trajectory: any): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const model = await ctx.builders.structure.createModel(trajectory);
    if (!this.ctx) return;
    const structure = await ctx.builders.structure.createStructure(model);
    if (!this.ctx) return;
    for (const kind of BALL_AND_STICK_COMPONENTS) {
      const comp = await ctx.builders.structure.tryCreateComponentStatic(structure, kind);
      if (!comp || !this.ctx) continue;
      await ctx.builders.structure.representation.addRepresentation(comp, {
        type: "ball-and-stick",
        typeParams: { ignoreLight: true },
        color: "element-symbol",
      });
    }
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

  // --- in-scene labels (tethered text anchored to a loci) ---

  private ensureLabelManager(): LabelManager | null {
    if (this.labelManager) return this.labelManager;
    if (!this.ctx) return null;
    this.labelManager = new LabelManager(this.ctx);
    return this.labelManager;
  }

  showHoverLabel(loci: StructureElement.Loci, text: string, color?: Color): void {
    const m = this.ensureLabelManager();
    if (m) void m.showHover(loci, text, color);
  }

  hideHoverLabel(): void {
    this.labelManager?.hideHover();
  }

  addPersistentLabel(key: string, loci: StructureElement.Loci, text: string, color?: Color): void {
    const m = this.ensureLabelManager();
    if (m) void m.addPersistent(key, loci, text, color);
  }

  removePersistentLabel(key: string): void {
    this.labelManager?.removePersistent(key);
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
    this.labelManager?.dispose();
    this.labelManager = null;
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
