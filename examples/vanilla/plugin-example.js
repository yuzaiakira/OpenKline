export function createExamplePlugin() {
  return {
    metadata: {
      id: "example.vanilla",
      name: "Vanilla Example Plugin",
      version: "1.0.0",
      apiVersion: 1,
      description: "A deterministic public SDK example",
    },
    setup(context) {
      context.state.set("mounted", true);
      context.indicators.register({
        metadata: {
          id: "EXAMPLE_CLOSE_OFFSET",
          name: "Close Offset",
          version: 1,
          description: "Adds a fixed offset to every close.",
          parameters: [{ name: "offset", type: "number", required: true }],
          outputs: [{ id: "value", title: "Close Offset", kind: "line" }],
        },
        validateParameters(parameters) {
          if (typeof parameters !== "object" || parameters === null || typeof parameters.offset !== "number") {
            throw new Error("offset is required");
          }
          return { offset: parameters.offset };
        },
        calculate(input, parameters) {
          return {
            indicatorId: "EXAMPLE_CLOSE_OFFSET",
            parameters,
            outputs: [{
              id: "value",
              title: "Close Offset",
              kind: "line",
              points: input.map((candle) => ({ time: candle.time, value: candle.close + parameters.offset })),
            }],
          };
        },
      });
      context.overlays.register({
        id: "example.vanilla-guide",
        title: "Example Guide",
        render(renderContext) {
          const pane = renderContext.pane();
          return pane === undefined ? [] : [{
            kind: "line",
            from: { x: pane.left, y: pane.top + 16 },
            to: { x: pane.right, y: pane.top + 16 },
            color: "#f59e0b",
            lineWidth: 2,
          }];
        },
      });
      context.commands.register({
        id: "example.vanilla.reset",
        title: "Reset example plugin",
        shortcut: "Ctrl+Shift+E",
        execute: () => context.state.set("mounted", true),
      });
    },
  };
}
