import { rmSync } from "node:fs";

for (const directory of ["dist", "test-dist"]) {
  rmSync(directory, { recursive: true, force: true });
}
