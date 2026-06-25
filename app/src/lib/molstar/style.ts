import { Color } from "molstar/lib/mol-util/color";

// Illustrative "demo" look lifted from ~/dev/fend_tubulinxyz (postprocessing-config.ts):
// a black outline + ambient occlusion, no shadows. Paired with a white canvas and a flat
// (ignoreLight) material on every representation, this gives the stylized, unlit look the
// cartoon/ball-and-stick reads with instead of Mol*'s default shiny lit material.
export const STYLIZED_POSTPROCESSING = {
  outline: {
    name: "on" as const,
    params: { scale: 0.5, color: Color(0x000000), threshold: 0.33, includeTransparent: true },
  },
  occlusion: {
    name: "on" as const,
    params: {
      multiScale: { name: "off" as const, params: {} },
      radius: 5,
      bias: 0.8,
      blurKernelSize: 15,
      blurDepthBias: 0.5,
      samples: 32,
      resolutionScale: 1,
      color: Color(0x000000),
    },
  },
  shadow: { name: "off" as const, params: {} },
};

export const WHITE_BACKGROUND = Color(0xffffff);

// Components to render as ball-and-stick by default (everything except water/coarse, so the
// view isn't dominated by scattered solvent oxygens).
export const BALL_AND_STICK_COMPONENTS = ["polymer", "ligand", "ion", "branched", "lipid"] as const;
