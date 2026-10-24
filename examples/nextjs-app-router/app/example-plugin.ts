import type { OpenKlinePlugin } from "openkline";

export const examplePlugin: OpenKlinePlugin = {
  metadata: {
    id: "example.nextjs",
    name: "Next.js Example Plugin",
    version: "1.0.0",
    apiVersion: 1,
  },
  setup(context) {
    context.state.set("mounted", true);
    context.commands.register({
      id: "example.nextjs.reset",
      title: "Reset example state",
      execute: () => context.state.set("mounted", true),
    });
  },
};
