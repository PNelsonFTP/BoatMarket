import { spawnSync } from "node:child_process";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
export function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `docker ${args[0]} failed: ${result.stderr || result.stdout}`,
    );
  return result.stdout.trim();
}
export async function smokeImage(
  image,
  { rendered = false, destination = "sbom/runtime" } = {},
) {
  if (!image || image.startsWith("-"))
    throw new Error("A Docker image reference is required");
  const name = `boatscout-smoke-${randomUUID()}`,
    password = randomBytes(24).toString("hex");
  const imageData = JSON.parse(docker(["image", "inspect", image]))[0];
  // No bind mounts or existing volumes: the disposable SQLite database lives in tmpfs.
  let created = false;
  try {
    docker([
      "run",
      "--detach",
      "--name",
      name,
      "--init",
      "--tmpfs",
      "/app/data:rw,uid=1000,gid=1000,mode=0700",
      "--env",
      `BOATSCOUT_PASSWORD=${password}`,
      "--env",
      "DATABASE_URL=file:/app/data/smoke.db",
      imageData.Id,
    ]);
    created = true;
    let healthy = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const check = spawnSync(
        "docker",
        [
          "exec",
          name,
          "node",
          "-e",
          "fetch('http://127.0.0.1:4310/api/health').then(async r=>{const b=await r.json();if(!r.ok)process.exit(1);console.log(JSON.stringify(b))}).catch(()=>process.exit(1))",
        ],
        { encoding: "utf8" },
      );
      if (check.status === 0) {
        healthy = JSON.parse(check.stdout);
        break;
      }
      await delay(1000);
    }
    if (!healthy)
      throw new Error(
        `Image did not become healthy: ${docker(["logs", name])}`,
      );
    const authCheck = docker([
      "exec",
      name,
      "node",
      "--input-type=module",
      "-e",
      "const login=await fetch('http://127.0.0.1:4310/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:process.env.BOATSCOUT_PASSWORD})});if(!login.ok)throw Error('Login failed');const {token}=await login.json();const rows=await fetch('http://127.0.0.1:4310/api/listings',{headers:{authorization:'Bearer '+token}});if(!rows.ok)throw Error('Listing query failed');console.log(JSON.stringify({authenticated:true,body:await rows.json()}))",
    ]);
    const staticCheck = JSON.parse(
      docker([
        "exec",
        name,
        "node",
        "--input-type=module",
        "-e",
        "import {createHash} from 'node:crypto'; const base='http://127.0.0.1:4310'; const page=await fetch(base+'/');if(!page.ok)throw Error('Website index is unreadable');const response=await fetch(base+'/data-mode.json');if(!response.ok)throw Error('Snapshot pointer is unreadable');const mode=await response.json();if(mode.snapshot){if(mode.path&&!/^snapshots\\/[a-f0-9]{64}\\.json$/.test(mode.path))throw Error('Invalid snapshot path');const snapshot=await fetch(base+'/'+(mode.path||'snapshot.json'));if(!snapshot.ok)throw Error('Snapshot generation is unreadable');if(mode.sha256&&createHash('sha256').update(Buffer.from(await snapshot.arrayBuffer())).digest('hex')!==mode.sha256)throw Error('Snapshot hash mismatch');}console.log(JSON.stringify({website:'passed',pointer:'passed',snapshot:mode.snapshot?'verified':'sample mode'}));",
      ]),
    );
    const probe = JSON.parse(
      docker([
        "exec",
        name,
        "node",
        "scripts/runtime-probe.mjs",
        ...(rendered ? ["--rendered"] : []),
      ]),
    );
    const report = {
      image: imageData.Id,
      repositoryDigests: imageData.RepoDigests || [],
      platform: `${imageData.Os}/${imageData.Architecture}`,
      generatedAt: new Date().toISOString(),
      health: healthy,
      auth: JSON.parse(authCheck),
      static: staticCheck,
      database: "isolated temporary tmpfs; migrations and listing query passed",
      probe,
      hostCheckoutInputsAtProbe: Object.fromEntries(
        await Promise.all(
          ["Dockerfile", "package-lock.json"].map(async (path) => [
            path,
            createHash("sha256")
              .update(await readFile(path))
              .digest("hex"),
          ]),
        ),
      ),
      networkFixture: rendered
        ? "loopback-only JavaScript rendering fixture passed"
        : "browser intentionally omitted",
    };
    if (probe.uid === 0 || !probe.nativeFiles.length)
      throw new Error(
        "Runtime must be non-root and include native Prisma engine evidence",
      );
    if (
      rendered &&
      (probe.rendering.status !== "passed" ||
        !probe.browserFiles.some((file) =>
          file.path.endsWith("/chrome-headless-shell"),
        ))
    )
      throw new Error(
        "Rendered image must execute JavaScript and inventory its actual browser binary",
      );
    await mkdir(destination, { recursive: true });
    const output = join(
      destination,
      `${imageData.Id.replace(":", "-")}.${report.generatedAt.replaceAll(":", "-")}.smoke.json`,
    );
    await writeFile(output, JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
    });
    return { output, report };
  } finally {
    if (created) docker(["rm", "--force", name]);
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [image, ...options] = process.argv.slice(2);
  if (options.some((option) => option !== "--rendered"))
    throw new Error("Usage: node scripts/docker-smoke.mjs IMAGE [--rendered]");
  const { output, report } = await smokeImage(image, {
    rendered: options.includes("--rendered"),
  });
  console.log(
    JSON.stringify({
      output,
      image: report.image,
      health: "passed",
      rendering: report.probe.rendering,
    }),
  );
}
