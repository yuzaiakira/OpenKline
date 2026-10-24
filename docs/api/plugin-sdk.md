# Plugin SDK API

Import `OpenKlinePlugin`, `PluginContext`, and `PluginHandle` from `openkline`.

```ts
import type { IndicatorDefinition, OpenKlinePlugin } from "openkline";

const plugin: OpenKlinePlugin = {
  metadata: {
    id: "example.double-close",
    name: "Double Close",
    version: "1.0.0",
    apiVersion: 1,
    hostVersionRange: "^0.1.0",
  },
  setup(context) {
    context.state.set("enabled", true);
    const removeIndicator = context.indicators.register(doubleClose as IndicatorDefinition);
    const removeEvent = context.events.on("dataUpdated", (event) => {
      context.state.set("lastUpdate", event.time);
    });
    context.commands.register({
      id: "example.double-close.reset",
      title: "Reset plugin state",
      shortcut: "Ctrl+Shift+D",
      execute: () => context.state.clear(),
    });
    return () => {
      removeEvent.dispose();
      removeIndicator.dispose();
    };
  },
};

const handle = chart.installPlugin(plugin);
handle.dispose(); // idempotent
```

`metadata.id` and command IDs use lowercase dotted/hyphenated identifiers.
Plugin and dependency versions use the supported semver subset (`*`, exact,
`^`, `~`, and comparisons). Required dependencies must already be installed;
uninstalling a dependency with active required dependents is rejected.

The typed event surface includes chart lifecycle, data updates, viewport,
indicator, drawing selection, tool activation, theme, crosshair, and datafeed
errors. All registrations are chart-scoped and cleaned up with the plugin.
State values are finite JSON values only. `context.overlays` accepts only the
controlled line/rectangle/text command model; arbitrary Canvas2D access is not
part of the public API.
