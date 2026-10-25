# Alert Engine

OpenKline alerts are local, deterministic evaluations over chart data. The
engine is framework-neutral: it has no DOM, React, network, vendor, browser
notification, or delivery-provider dependency. Applications decide how to
display an `AlertEvent`; OpenKline does not send email, push, webhook, or
trading orders.

## Layers

1. `AlertEngine` validates serializable definitions, evaluates conditions, and
   owns lifecycle, event, diagnostic, history, and status state.
2. `Chart` adapts candles, indicator output snapshots, KlineScript numeric
   output snapshots, and visible drawings into `AlertEvaluationInput`.
3. `ReplayController` evaluates a separate simulated runtime and marks every
   replay event with `simulated: true`.
4. The private Studio consumes only the public Chart alert methods and renders
   local history. It does not add a second evaluator.

The engine stores live and replay runtime maps independently. A replay reset,
seek, or simulated event cannot modify live alert state. Definitions are
serializable, but runtime observations, deduplication sets, diagnostics, and
history are intentionally not persisted in a workspace.

## Conditions and extension point

The built-in contract supports strict price thresholds and crossings, numeric
indicator thresholds and crossings, indicator-output pair crossings, numeric
KlineScript output thresholds and crossings, host-supplied boolean script
outputs, and horizontal drawing crossings. Future conditions can be added as
new discriminated `AlertCondition` variants while reusing the same input,
frequency, status, and lifecycle contracts. Vendor-specific data is not part
of the condition model.

Chart indicator and script output IDs are the public managed IDs returned by
`addIndicator` or `addScriptIndicator`; their output IDs come from the
indicator result metadata. The current KlineScript language exposes numeric
plot outputs. Boolean script conditions are available to a host that supplies
stable boolean snapshots through the framework-neutral engine contract; the
Chart adapter does not invent a boolean KlineScript output.

## Failure and cleanup behavior

An unavailable, misaligned, duplicate, null, or non-finite output produces a
diagnostic for the affected rule and does not abort evaluation of unrelated
rules. Listener failures are also converted to diagnostics. `dispose()` clears
definitions, state, history, and listeners. Chart destruction disposes its
engine before removing the canvas.

There is no external alert delivery or security boundary in this component.
Applications must treat alert definitions and event listeners as local
application data and must implement any delivery policy separately.
