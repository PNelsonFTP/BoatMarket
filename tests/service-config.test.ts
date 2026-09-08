import { mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { generateService } from "../server/service-config";
it("generates a user launch agent with explicit argv and existing cadence intact", () => {
  const config = generateService({
    platform: "macos",
    projectDirectory: "/Users/test/Boat & Market",
    nodePath: "/opt/node/bin/node",
    homeDirectory: "/Users/test",
    uid: 501,
  });
  expect(config.content).toContain("Boat &amp; Market");
  expect(config.content).toContain("<key>SuccessfulExit</key><false/>");
  expect(config.start.slice(0, 3)).toEqual([
    "launchctl",
    "bootstrap",
    "gui/501",
  ]);
  expect(config.content).not.toContain("WORKER_INTERVAL_MINUTES");
  expect(config.installPath).toContain("/Library/LaunchAgents/");
  expect(config.content).toContain("<string>/opt/node/bin/node</string>");
  expect(config.content).toContain(
    "<string>/Users/test/Boat &amp; Market/server/worker.ts</string>",
  );
  expect(config.content).toContain(
    "<string>/Users/test/Boat &amp; Market/logs/service-out.log</string>",
  );
});
it("generates a systemd user unit with escaped paths and no shell command", () => {
  const config = generateService({
    platform: "linux",
    projectDirectory: "/home/test/boat % market",
    nodePath: "/usr/bin/node",
    homeDirectory: "/home/test",
  });
  expect(config.content).toContain("boat %% market");
  expect(config.content).toContain("Restart=on-failure");
  expect(config.start).toEqual([
    "systemctl",
    "--user",
    "enable",
    "--now",
    config.filename,
  ]);
  expect(config.content).not.toContain("/bin/sh");
  expect(config.installPath).toBe(
    `/home/test/.config/systemd/user/${config.filename}`,
  );
  expect(config.content).toContain(
    'ExecStart="/usr/bin/node" --import tsx "/home/test/boat %% market/server/worker.ts"',
  );
});
it("generates a Windows interactive task with one instance, restart policy and no password", () => {
  const config = generateService({
    platform: "windows",
    projectDirectory: "C:\\Users\\Test\\Boat Market",
    nodePath: "C:\\Program Files\\nodejs\\node.exe",
    homeDirectory: "C:\\Users\\Test",
    user: "EXAMPLE\\Test",
  });
  expect(config.content).toContain(
    "<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>",
  );
  expect(config.content).toContain("<LogonType>InteractiveToken</LogonType>");
  expect(config.content).toContain(
    "<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>",
  );
  expect(config.content).not.toMatch(/Password|HighestAvailable/);
  expect(config.start[0]).toBe("schtasks.exe");
  const samePath = generateService({
    platform: "windows",
    projectDirectory: "c:\\users\\test\\boat market",
    nodePath: "C:\\Program Files\\nodejs\\node.exe",
    homeDirectory: "C:\\Users\\Test",
    user: "EXAMPLE\\Test",
  });
  expect(samePath.name).toBe(config.name);
});
it("rejects service path injection", () => {
  expect(() =>
    generateService({
      platform: "linux",
      projectDirectory: "/tmp/a\nExecStart=evil",
      nodePath: "/usr/bin/node",
      homeDirectory: "/home/test",
    }),
  ).toThrow("line breaks");
});

it("CLI dry-run writes nothing and generated launchd XML passes native validation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boatscout-service-"));
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/service.ts",
        "--dry-run",
        "--platform=macos",
        `--output=${join(directory, "absent")}`,
      ],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    await expect(stat(join(directory, "absent"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    if (process.platform === "darwin") {
      const service = generateService({
        platform: "macos",
        projectDirectory: directory,
        nodePath: process.execPath,
        homeDirectory: directory,
        uid: process.getuid?.(),
      });
      const file = join(directory, service.filename);
      await writeFile(file, service.content);
      const checked = spawnSync("plutil", ["-lint", file], {
        encoding: "utf8",
      });
      expect(checked.status, checked.stderr + checked.stdout).toBe(0);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
