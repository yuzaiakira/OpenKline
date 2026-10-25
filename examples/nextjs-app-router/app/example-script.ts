import { compileKlineScript } from "openkline";

const result = compileKlineScript([
  'indicator("Next EMA")',
  'period = input.int("Period", default=14, min=1, max=100)',
  'value = ta.ema(close, period)',
  'plot(value, title="EMA", color="#8B5CF6")',
].join("\n"));

if (!result.success) throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join("; "));

export const exampleScript = result.program;
