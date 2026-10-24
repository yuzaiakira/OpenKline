# Plugin System Architecture

OpenKline exposes two extension contracts. `OpenKlineExtension` is retained
for Phase 2 source compatibility. The Phase 3 `OpenKlinePlugin` contract is
the supported platform boundary for new work.

```text
OpenKlinePlugin
      |
      v
PluginRegistry -- metadata/dependency/API validation
      |
      +-- indicators -> IndicatorRegistry -> ChartModel series
      +-- drawings  -> DrawingEngine -> controlled geometry
      +-- overlays  -> validated line/rectangle/text commands
      +-- events    -> typed Chart events
      +-- commands  -> deterministic IDs/shortcuts
      +-- state     -> JSON-only per-plugin store
```

Each chart owns one registry. Installing a plugin validates its identifier,
semver version, API version, host range, and required dependencies before
calling `setup`. Every registration returns a disposable resource. Activation
failure disposes resources in reverse order and does not leave the plugin
installed. Uninstallation is idempotent through `PluginHandle`; required
dependents prevent unsafe removal. Chart destruction disposes all plugins and
their resources.

Plugins receive typed capabilities, not the raw chart, DOM, or Canvas2D
context. Overlay rendering is limited to validated line, rectangle, and text
commands and is clipped to the chart plot. Rendering failures are isolated to
the faulty overlay. Plugins are still in-process JavaScript and therefore are
trusted application code; this SDK is not a security sandbox or a remote-code
loader. Applications must review and bundle plugin code explicitly.

The registry does not fetch packages, evaluate strings, or define a marketplace
policy. Applications own distribution, signature verification, permissions,
and user consent. A future sandbox can be added behind the same versioned
capability boundary.
