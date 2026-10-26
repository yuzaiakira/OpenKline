import { join } from "node:path";
import { validateAllEvidencePacks } from "./browser-evidence-validator.mjs";

const result = validateAllEvidencePacks({ evidenceRoot: join(process.cwd(), "docs", "evidence", "browser") });
console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
