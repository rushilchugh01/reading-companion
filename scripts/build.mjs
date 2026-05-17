import { spawn } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packagePath = path.join(projectRoot, "package.json");
const lockPath = path.join(projectRoot, "package-lock.json");
const distRoot = path.join(projectRoot, "dist");
const rawBuild = path.join(distRoot, "chrome-mv3");
const latestBuild = path.join(distRoot, "latest");
const logsRoot = path.join(projectRoot, "logs");
const artifactsBuild = path.join(logsRoot, "artifacts");

const version = await bumpVersion();
await cleanBuildOutputs();
await run("wxt", ["build"]);
await copyBuildOutputs(version);

console.log(`[build] Chrome extension ready: ${path.join(distRoot, `chrome-mv3-v${version}`)}`);
console.log(`[build] Latest extension ready: ${latestBuild}`);

async function bumpVersion() {
  const packageJson = await readJson(packagePath);
  const nextVersion = bumpMinor(readVersion(packageJson, packagePath));
  packageJson.version = nextVersion;
  await writeJson(packagePath, packageJson);

  const lockJson = await readJson(lockPath).catch(() => undefined);
  if (lockJson) {
    lockJson.version = nextVersion;
    if (lockJson.packages?.[""]) {
      lockJson.packages[""].version = nextVersion;
    }
    await writeJson(lockPath, lockJson);
  }

  console.log(`[build] Bumped version to ${nextVersion}`);
  return nextVersion;
}

async function cleanBuildOutputs() {
  await rm(rawBuild, { force: true, recursive: true });
  await rm(latestBuild, { force: true, recursive: true });
  await removeVersionedBuilds();
  await rm(artifactsBuild, { force: true, recursive: true });
}

async function removeVersionedBuilds() {
  const entries = await readdir(distRoot, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && /^chrome-mv3-v\d+\.\d+\.\d+$/.test(entry.name))
      .map((entry) => rm(path.join(distRoot, entry.name), { force: true, recursive: true }))
  );
}

async function copyBuildOutputs(version) {
  if (!(await exists(path.join(rawBuild, "manifest.json")))) {
    throw new Error(`WXT build did not create ${rawBuild}`);
  }

  const versionedBuild = path.join(distRoot, `chrome-mv3-v${version}`);
  await mkdir(distRoot, { recursive: true });
  await mkdir(logsRoot, { recursive: true });
  await cp(rawBuild, latestBuild, { recursive: true });
  await cp(rawBuild, versionedBuild, { recursive: true });
  await copyIfExists(path.join(projectRoot, "test-results"), path.join(artifactsBuild, "test-results"));
  await copyIfExists(path.join(projectRoot, "playwright-report"), path.join(artifactsBuild, "playwright-report"));
  await copyIfExists(path.join(projectRoot, "temp", "e2e-videos"), path.join(artifactsBuild, "e2e-videos"));
  await writeFile(
    path.join(distRoot, "last-sync.json"),
    `${JSON.stringify({
      latest: latestBuild,
      source: rawBuild,
      syncedAt: new Date().toISOString(),
      version,
      versioned: versionedBuild
    }, null, 2)}\n`
  );
  await writeFile(path.join(distRoot, "latest-version.txt"), `${version}\n`);
  await writeFile(
    path.join(logsRoot, "last-artifacts-sync.json"),
    `${JSON.stringify({
      artifacts: artifactsBuild,
      syncedAt: new Date().toISOString()
    }, null, 2)}\n`
  );
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      shell: true,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? "unknown status"}`));
    });
  });
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(sourcePath, destinationPath) {
  if (!(await exists(sourcePath))) return;
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await cp(sourcePath, destinationPath, { recursive: true });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readVersion(packageJson, filePath) {
  if (typeof packageJson.version !== "string") {
    throw new Error(`${filePath} is missing a string version.`);
  }
  return packageJson.version;
}

function bumpMinor(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Expected semver major.minor.patch, got: ${version}`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]) + 1;
  return `${major}.${minor}.0`;
}
