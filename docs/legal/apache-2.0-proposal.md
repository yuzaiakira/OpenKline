# Proposed Apache-2.0 licensing decision

Status: **Pending project-owner and legal confirmation. Not an effective
license grant.**

The preferred candidate for the OpenKline developer preview is Apache License
2.0, SPDX identifier `Apache-2.0`. It is a permissive license with an express
patent license and attribution/notice conditions that are generally suitable
for a TypeScript library intended for reuse. This document records a proposal,
not a legal opinion and not evidence that the project owner has authority to
grant rights to every file in the repository.

## Ownership and provenance review

- The repository origin is `github.com/yuzaiakira/OpenKline`.
- The local Git history currently contains one contributor identity:
  `Akira Yuzai <yuzai.akira@gmail.com>`.
- No prior `LICENSE`, `NOTICE`, `COPYING`, or patent grant was found in the
  tracked repository.
- No copied third-party source, fonts, icons, images, or bundled media were
  found in the tracked assets review. Generated `dist` output is derived from
  repository TypeScript and is not currently tracked.
- Dependency license metadata is inventoried separately. Dependency licenses
  do not become OpenKline's license and must not be relicensed by this project.

The maintainer must confirm copyright ownership, contributor authorization,
any employment or assignment obligations, and whether any untracked or
historical material is subject to a prior license or patent commitment. Those
questions cannot be established from Git author metadata alone.

## Proposed files and activation steps

`LICENSE-APACHE-2.0.PROPOSED` contains the Apache License 2.0 text sourced
from the system's standard Apache license text. It is deliberately named and
kept outside the effective package license path while approval is pending.

After written owner/legal approval and completion of the provenance review:

1. Rename the proposed file to the exact root `LICENSE` filename without
   editing the official text.
2. Add `"license": "Apache-2.0"` to the root and `@openkline/react` package
   manifests, if both packages are approved for distribution.
3. Add SPDX identifiers/copyright notices to project-authored source files as
   the owner/legal reviewer directs.
4. Create a `NOTICE` file only for verified project or third-party notices;
   do not invent attribution text.
5. Rebuild, inspect `npm pack --dry-run`, run the clean consumer checks, and
   update the release reports.

Until those steps occur, README and release reports must continue to state
that no effective license has been selected and the package is not approved
for public redistribution.
