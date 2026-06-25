import { DefaultPluginUISpec, type PluginUISpec } from "molstar/lib/mol-plugin-ui/spec";

// Default plugin spec with the surrounding UI chrome hidden — we drive the plugin
// programmatically and only want the 3D canvas + its viewport controls. Keeps all
// of Mol*'s default behaviours (HighlightLoci, SelectLoci, etc.).
export const viewerSpec: PluginUISpec = {
  ...DefaultPluginUISpec(),
  layout: {
    initial: { isExpanded: false, showControls: false, controlsDisplay: "reactive" },
  },
  components: {
    controls: { bottom: "none" },
    remoteState: "none",
  },
};
