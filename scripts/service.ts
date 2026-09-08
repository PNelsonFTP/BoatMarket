import "dotenv/config";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir, userInfo } from "node:os";
import { spawnSync } from "node:child_process";
import {
  generateService,
  type ServicePlatform,
} from "../server/service-config";
import { atomicJson } from "../server/refresh-report";
const args = process.argv.slice(2);
const known = ["--dry-run", "--install", "--uninstall", "--status", "--help"];
try {
  if (args.includes("--help"))
    console.log(
      "Usage: npm run service -- [--platform=macos|linux|windows] [--output=data/services] [--node=/absolute/node] [--project=/project] [--user=DOMAIN\\name] [--dry-run | --install | --uninstall | --status]\nDefault writes reviewable service definitions only. Dry-run writes nothing. Install/uninstall are explicit and apply only to this project's generated identity on the current OS. No administrator/root privileges or stored account passwords are used. The existing .env worker cadence is preserved (30 minutes by default). User services run while that account/session is available; this is not remote hosting or publication.",
    );
  else {
    for (const arg of args)
      if (
        !known.includes(arg) &&
        !/^--(?:platform|output|node|project|user)=.+/.test(arg)
      )
        throw new Error(`Unknown option ${arg}`);
    if (
      args.filter((arg) =>
        ["--dry-run", "--install", "--uninstall", "--status"].includes(arg),
      ).length > 1
    )
      throw new Error("Choose only one service action");
    const value = (key: string) =>
      args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
    const current =
      process.platform === "darwin"
        ? "macos"
        : process.platform === "win32"
          ? "windows"
          : "linux";
    const platform = value("platform") ?? current;
    if (!["macos", "linux", "windows"].includes(platform))
      throw new Error("Unsupported service platform");
    const config = generateService({
      platform: platform as ServicePlatform,
      projectDirectory: value("project") ?? process.cwd(),
      nodePath: value("node") ?? process.execPath,
      homeDirectory: homedir(),
      uid: process.getuid?.(),
      user:
        value("user") ??
        (process.platform === "win32"
          ? `${process.env.USERDOMAIN ? process.env.USERDOMAIN + "\\" : ""}${userInfo().username}`
          : undefined),
    });
    const command = (tokens: string[], optional = false) => {
      const result = spawnSync(tokens[0], tokens.slice(1), {
        encoding: "utf8",
        shell: false,
      });
      if (result.status !== 0 && !optional)
        throw new Error(
          `${tokens[0]} failed: ${result.stderr || result.error?.message || result.stdout}`,
        );
      return {
        status: result.status,
        output: result.stdout,
        error: result.stderr,
      };
    };
    const action = args.includes("--install")
      ? "install"
      : args.includes("--uninstall")
        ? "uninstall"
        : args.includes("--status")
          ? "status"
          : args.includes("--dry-run")
            ? "dry-run"
            : "generate";
    if (
      ["install", "uninstall", "status"].includes(action) &&
      platform !== current
    )
      throw new Error(
        "Cannot manage a service for a different operating system; generate its definition instead",
      );
    if (action === "dry-run")
      console.log(
        JSON.stringify(
          {
            action,
            ...config,
            note: "No files written or service installed. Environment and current cadence preserved.",
          },
          null,
          2,
        ),
      );
    else if (action === "status")
      console.log(JSON.stringify(command(config.status), null, 2));
    else if (action === "uninstall") {
      if (platform === "windows")
        command(["schtasks.exe", "/End", "/TN", config.name], true);
      command(config.stop);
      if (platform !== "windows") {
        await rm(config.installPath, { force: true });
        if (platform === "linux")
          command(["systemctl", "--user", "daemon-reload"]);
      }
      console.log(
        `Removed this project's service ${config.name}; other projects are untouched.`,
      );
    } else {
      const directory = resolve(value("output") ?? "data/services");
      await mkdir(directory, { recursive: true });
      const generated = join(directory, config.filename);
      await writeFile(
        generated,
        platform === "windows"
          ? Buffer.from("\ufeff" + config.content, "utf16le")
          : config.content,
        { mode: 0o600 },
      );
      await atomicJson(join(directory, `${config.name}-manifest.json`), {
        ...config,
        content: undefined,
        generated,
        generatedAt: new Date().toISOString(),
        state: "generated",
        cadence:
          "Reads existing WORKER_INTERVAL_MINUTES from project .env; default 30",
        sources: [
          "https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html",
          "https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html",
          "https://learn.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-schema",
        ],
      });
      if (action === "install") {
        await mkdir(join(value("project") ?? process.cwd(), "logs"), {
          recursive: true,
        });
        await mkdir(dirname(config.installPath), { recursive: true });
        try {
          const prior = await readFile(config.installPath);
          if (!prior.equals(await readFile(generated)))
            throw new Error(
              "Existing service definition differs; uninstall it explicitly before replacing",
            );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          await writeFile(config.installPath, await readFile(generated), {
            mode: 0o600,
          });
        }
        if (platform === "linux")
          command(["systemctl", "--user", "daemon-reload"]);
        command(config.start);
        if (platform === "windows")
          command(["schtasks.exe", "/Run", "/TN", config.name]);
      }
      console.log(
        JSON.stringify(
          {
            action,
            generated,
            service: config.name,
            installed: action === "install",
            statusCommand: config.status,
            note: "Existing worker interval and .env settings are preserved; no website publication configured.",
          },
          null,
          2,
        ),
      );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
