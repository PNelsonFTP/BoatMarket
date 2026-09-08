import { createHash } from "node:crypto";
import { join, resolve, win32 } from "node:path";
export type ServicePlatform = "macos" | "linux" | "windows";
export type ServiceConfig = {
  platform: ServicePlatform;
  name: string;
  filename: string;
  content: string;
  installPath: string;
  start: string[];
  stop: string[];
  status: string[];
};
const xml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const unitQuote = (value: string) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "%%").replace(/\$/g, "$$")}"`;
const windowsArg = (value: string) =>
  `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1")}"`;
export function generateService(options: {
  platform: ServicePlatform;
  projectDirectory: string;
  nodePath: string;
  homeDirectory: string;
  uid?: number;
  user?: string;
}): ServiceConfig {
  for (const value of [
    options.projectDirectory,
    options.nodePath,
    options.homeDirectory,
  ])
    if (/[\r\n\0]/.test(value))
      throw new Error("Service paths must not contain line breaks or NUL");
  const paths = options.platform === "windows" ? win32 : { join, resolve };
  const project = paths.resolve(options.projectDirectory),
    node = paths.resolve(options.nodePath);
  const id = createHash("sha256")
    .update(options.platform === "windows" ? project.toLowerCase() : project)
    .digest("hex")
    .slice(0, 10);
  const name = `boatscout-${id}`;
  const script = paths.join(project, "server", "worker.ts");
  if (options.platform === "macos") {
    const label = `local.${name}`,
      filename = `${label}.plist`,
      installPath = join(
        options.homeDirectory,
        "Library",
        "LaunchAgents",
        filename,
      );
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${label}</string>\n<key>ProgramArguments</key><array><string>${xml(node)}</string><string>--import</string><string>tsx</string><string>${xml(script)}</string></array>\n<key>WorkingDirectory</key><string>${xml(project)}</string>\n<key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>30</integer>\n<key>StandardOutPath</key><string>${xml(join(project, "logs", "service-out.log"))}</string><key>StandardErrorPath</key><string>${xml(join(project, "logs", "service-error.log"))}</string>\n</dict></plist>\n`;
    const domain = `gui/${options.uid ?? 0}`;
    return {
      platform: options.platform,
      name: label,
      filename,
      content,
      installPath,
      start: ["launchctl", "bootstrap", domain, installPath],
      stop: ["launchctl", "bootout", `${domain}/${label}`],
      status: ["launchctl", "print", `${domain}/${label}`],
    };
  }
  if (options.platform === "linux") {
    const filename = `${name}.service`,
      installPath = join(
        options.homeDirectory,
        ".config",
        "systemd",
        "user",
        filename,
      );
    const content = `[Unit]\nDescription=BoatScout supervised local worker\nStartLimitIntervalSec=300\nStartLimitBurst=5\n\n[Service]\nType=exec\nWorkingDirectory=${unitQuote(project)}\nExecStart=${unitQuote(node)} --import tsx ${unitQuote(script)}\nRestart=on-failure\nRestartSec=30\nKillSignal=SIGTERM\nTimeoutStopSec=45\n\n[Install]\nWantedBy=default.target\n`;
    return {
      platform: options.platform,
      name,
      filename,
      content,
      installPath,
      start: ["systemctl", "--user", "enable", "--now", filename],
      stop: ["systemctl", "--user", "disable", "--now", filename],
      status: ["systemctl", "--user", "status", filename],
    };
  }
  if (!options.user)
    throw new Error(
      "Windows generation needs --user=DOMAIN\\username (interactive account, no stored password)",
    );
  const task = `BoatScout-${id}`,
    filename = `${task}.xml`,
    installPath = win32.join(project, "data", "services", filename);
  const content = `<?xml version="1.0" encoding="UTF-16"?>\n<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">\n<RegistrationInfo><Description>BoatScout worker; configured .env cadence is preserved.</Description></RegistrationInfo>\n<Triggers><LogonTrigger><Enabled>true</Enabled><UserId>${xml(options.user)}</UserId></LogonTrigger></Triggers>\n<Principals><Principal id="Author"><UserId>${xml(options.user)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>\n<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>true</AllowHardTerminate><StartWhenAvailable>true</StartWhenAvailable><Enabled>true</Enabled><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure></Settings>\n<Actions Context="Author"><Exec><Command>${xml(node)}</Command><Arguments>${xml(`--import tsx ${windowsArg(script)}`)}</Arguments><WorkingDirectory>${xml(project)}</WorkingDirectory></Exec></Actions>\n</Task>\n`;
  return {
    platform: options.platform,
    name: task,
    filename,
    content,
    installPath,
    start: ["schtasks.exe", "/Create", "/TN", task, "/XML", installPath],
    stop: ["schtasks.exe", "/Delete", "/TN", task, "/F"],
    status: ["schtasks.exe", "/Query", "/TN", task, "/V", "/FO", "LIST"],
  };
}
