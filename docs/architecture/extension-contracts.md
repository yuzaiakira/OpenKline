# Extension Contracts

OpenKline keeps extension points at typed, vendor-neutral boundaries. An
extension can register an indicator definition or a drawing tool through the
versioned `ExtensionHost` contract. Registration remains explicit and the
chart owns the resulting lifecycle.

```ts
const extension: OpenKlineExtension = {
  metadata: {
    id: "example-tools",
    name: "Example Tools",
    version: 1,
    description: "Deterministic analysis tools",
  },
  activate(host) {
    const removeIndicator = host.registerIndicator(customIndicator);
    const removeDrawing = host.registerDrawingTool(customDrawingTool);
    return () => {
      removeIndicator();
      removeDrawing();
    };
  },
};
```

`ExtensionMetadata` and `ExtensionHost.apiVersion` provide a compatibility
boundary. Indicator and drawing definitions retain their own validation,
calculation/geometry, and disposal contracts. Existing series, pane, and
datafeed APIs are already public typed contracts and remain independent of
extensions; custom series/pane renderers and vendor adapters are deliberately
not accepted by this minimal host until their rendering and security contracts
are specified.

This phase defines the contracts and a trusted in-process activation seam. It
does not add a package loader,
dynamic import policy, permissions model, remote code execution, or a
marketplace. Applications should import trusted extension modules and activate
them explicitly. A future plugin SDK can add those concerns without changing
the versioned indicator and drawing contracts.

## Phase 3 plugin contract

New integrations should use `OpenKlinePlugin` and `PluginRegistry`. The plugin
API version is numeric and independent from the package version. A plugin is
validated, dependency-checked, activated with rollback, and disposed in a
chart-scoped lifecycle. It can register the same indicator/drawing contracts,
plus typed events, JSON state, commands, and bounded overlay primitives. The
legacy extension contract remains available for existing consumers but does
not provide plugin state, dependencies, commands, or overlays.
