import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export class ConsumerPreviewError extends Error {
  constructor(message, { code, status = "FAIL", details = {} } = {}) {
    super(message);
    this.name = "ConsumerPreviewError";
    this.code = code ?? "CONSUMER_PREVIEW_FAILURE";
    this.status = status;
    this.details = details;
    this.exitCode = status === "BLOCKED" ? 2 : 1;
  }
}

export function readPackedManifest(archive) {
  if (!existsSync(archive)) {
    throw new ConsumerPreviewError(`Packed archive does not exist: ${archive}`, {
      code: "MISSING_LOCAL_ARCHIVE",
      details: { archive },
    });
  }
  try {
    const text = execFileSync("tar", ["-xOf", archive, "package/package.json"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(text);
  } catch (error) {
    throw new ConsumerPreviewError(`Packed archive has no valid package/package.json: ${archive}`, {
      code: "MALFORMED_PACKED_PACKAGE",
      details: { archive, cause: error instanceof Error ? error.message : String(error) },
    });
  }
}

export function listPackedArchives(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry) => entry.endsWith(".tgz"))
    .sort()
    .map((entry) => resolve(directory, entry));
}

export function validatePackedManifest(manifest, expected) {
  if (manifest?.name !== expected.name || manifest?.version !== expected.version) {
    throw new ConsumerPreviewError(
      `Packed metadata mismatch: expected ${expected.name}@${expected.version}, got ${manifest?.name ?? "<missing>"}@${manifest?.version ?? "<missing>"}`,
      {
        code: "PACKED_METADATA_MISMATCH",
        details: { expected, actual: { name: manifest?.name, version: manifest?.version } },
      },
    );
  }
  for (const [name, range] of Object.entries(expected.peerDependencies ?? {})) {
    if (manifest.peerDependencies?.[name] !== range) {
      throw new ConsumerPreviewError(
        `Packed peer metadata mismatch for ${manifest.name}: ${name} must be ${range}`,
        {
          code: "PACKED_PEER_METADATA_MISMATCH",
          details: { package: manifest.name, name, expected: range, actual: manifest.peerDependencies?.[name] },
        },
      );
    }
  }
  return manifest;
}

export function selectPackedArchive(directory, expected) {
  const archives = listPackedArchives(directory);
  if (archives.length === 0) {
    throw new ConsumerPreviewError(`No local package archive was produced in ${directory}`, {
      code: "MISSING_LOCAL_ARCHIVE",
      details: { directory, expected },
    });
  }

  const inspected = archives.map((archive) => {
    try {
      return { archive, manifest: readPackedManifest(archive) };
    } catch (error) {
      return { archive, error };
    }
  });
  const malformed = inspected.filter((entry) => entry.error !== undefined);
  if (malformed.length > 0) {
    throw new ConsumerPreviewError("One or more local package archives are malformed", {
      code: "MALFORMED_PACKED_PACKAGE",
      details: { directory, archives: malformed.map((entry) => basename(entry.archive)) },
    });
  }

  const matching = inspected.filter(({ manifest }) => manifest.name === expected.name && manifest.version === expected.version);
  if (matching.length === 0) {
    throw new ConsumerPreviewError(`No archive matches ${expected.name}@${expected.version}`, {
      code: "PACKED_METADATA_MISMATCH",
      details: {
        directory,
        expected,
        discovered: inspected.map(({ archive, manifest }) => ({ archive: basename(archive), name: manifest.name, version: manifest.version })),
      },
    });
  }
  if (matching.length !== 1) {
    throw new ConsumerPreviewError(`Multiple archives match ${expected.name}@${expected.version}`, {
      code: "AMBIGUOUS_LOCAL_ARCHIVE",
      details: { directory, expected, archives: matching.map((entry) => basename(entry.archive)) },
    });
  }
  const selected = matching[0];
  validatePackedManifest(selected.manifest, expected);
  return selected;
}

export function packageLockEntry(lock, name) {
  const entry = lock.packages?.[`node_modules/${name}`];
  if (entry?.version === undefined || entry.resolved === undefined) {
    throw new Error(`Lockfile has no resolved package entry for ${name}`);
  }
  return { name, version: entry.version, resolved: entry.resolved, integrity: entry.integrity };
}

export function cacheContainsResolvedArtifact(cacheEntries, resolved) {
  if (typeof resolved !== "string") return false;
  let path = resolved;
  try {
    path = new URL(resolved).pathname.replace(/^\//, "");
  } catch {
    // A lockfile with a non-URL resolution is not an npm registry artifact.
  }
  return cacheEntries.some((entry) => entry.includes(resolved) || entry.includes(path));
}

export function missingOfflineArtifacts({ cacheEntries, lock, packages }) {
  return packages
    .map((name) => packageLockEntry(lock, name))
    .filter((entry) => !cacheContainsResolvedArtifact(cacheEntries, entry.resolved))
    .map(({ name, version, resolved }) => ({ name, version, resolved }));
}

function firstMatch(text, pattern) {
  const match = text.match(pattern);
  return match?.[1] ?? null;
}

export function classifyNpmInstallFailure({ output, offline, missingArtifacts = [] }) {
  const text = String(output);
  const code = firstMatch(text, /npm error code ([A-Z0-9_]+)/i);
  const foundVersion = firstMatch(text, /Found:?\s+[^\s]+@(\S+)/i);
  const peer = firstMatch(text, /peer\s+[^@\s]+@(?:["'])?([^\s"']+)/i);
  const unresolvedOfflineMetadata = offline && (
    foundVersion === "undefined" ||
    /ENOTCACHED|not in npm cache|cache mode|offline.*metadata|no matching version found/i.test(text)
  );

  if (unresolvedOfflineMetadata) {
    return {
      status: "BLOCKED",
      code: "OFFLINE_CACHE_INCOMPLETE",
      reason: "The isolated offline npm cache does not contain enough registry metadata or artifacts to resolve the requested dependency tree.",
      details: { npmCode: code, foundVersion, peer, missingArtifacts },
    };
  }
  if (/ERESOLVE/i.test(text)) {
    return {
      status: "FAIL",
      code: "INCOMPATIBLE_PEER_DEPENDENCY",
      reason: "npm peer resolution rejected the package metadata with resolved package versions.",
      details: { npmCode: code, foundVersion, peer, missingArtifacts },
    };
  }
  return {
    status: "FAIL",
    code: code ?? "NPM_INSTALL_FAILED",
    reason: "The independent consumer installation failed for a reason other than an incomplete offline cache.",
    details: { npmCode: code, foundVersion, peer, missingArtifacts },
  };
}

export function readInstalledManifest(directory, packageName) {
  const manifestPath = join(directory, "node_modules", packageName, "package.json");
  if (!existsSync(manifestPath)) throw new Error(`Installed package is missing: ${packageName}`);
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export function assertInstalledPackage(directory, expected) {
  const manifest = readInstalledManifest(directory, expected.name);
  if (manifest.name !== expected.name || manifest.version !== expected.version) {
    throw new Error(`Installed metadata mismatch for ${expected.name}: ${manifest.name}@${manifest.version}`);
  }
  return manifest;
}
