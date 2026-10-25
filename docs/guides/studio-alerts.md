# Studio alerts

OpenKline Studio provides a small local alert panel backed by the public Chart
API. It is intended for deterministic chart analysis and demonstration; it is
not a notification service or trading automation system.

## Create and manage an alert

1. Open the `Alerts` panel in the right-hand Settings sidebar.
2. Enter a name and a finite close-price threshold.
3. Select a frequency and choose **Create alert**.
4. Use **Pause/Enable** or the remove button to manage the definition.
5. Save or export the workspace to persist definitions as JSON.

The panel currently creates `price-cross-above` rules. Indicator, script, and
drawing conditions are available through the public TypeScript API and can be
added by an application-specific UI without changing the evaluator.

## Events and replay

Chart `alertTriggered` events update the recent-events list. Live events are
labelled `LIVE`; replay events are labelled `SIM`. Entering replay preserves
the definitions, evaluates simulated history in a separate runtime, and keeps
simulated events out of the live history. Seeking rebuilds the visible prefix
so the result is deterministic. Exiting replay clears simulated runtime/history
and restores the live workspace.

Alert changes are disabled while replay is active, just like source and chart
structure mutations. The UI never requests external credentials and never
sends alert events to a network service.

## Workspace and limitations

Saved workspaces include alert definitions but not event history, prior
observations, or delivery state. Loading a workspace validates definitions
before applying them. Browser notification permissions, email, webhooks,
broker actions, and background scheduling are intentionally outside Studio's
scope.
