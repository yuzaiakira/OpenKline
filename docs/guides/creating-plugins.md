# Creating Plugins

1. Define a stable lowercase plugin ID and semver version.
2. Declare `apiVersion: 1` and any required host/dependency ranges.
3. Register indicators, drawing tools, overlays, events, and commands inside
   `setup`.
4. Return cleanup for resources created outside the registry, although every
   SDK registration is also disposed automatically.
5. Keep state JSON-compatible and deterministic so workspaces can be restored.
6. Test activation rollback, duplicate IDs, missing dependencies, rendering,
   command conflicts, and disposal.

Plugins are trusted modules bundled by the host application. Do not load
unreviewed remote code, use `eval`, or assume the SDK provides isolation.
Custom visuals must use controlled overlay commands; custom analysis tools must
use the indicator/drawing contracts.
