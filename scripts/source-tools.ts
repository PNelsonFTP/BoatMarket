import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import {
  captureSourceFixture,
  previewSourceParse,
  applySourceParse,
} from "../server/source-tools";
import { db } from "../server/db";
try {
  const args = process.argv.slice(2),
    command = args.shift(),
    value = (key: string) =>
      args.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3);
  for (const arg of args)
    if (!/^--(?:source|url|file|output|observed-at|review)=.+$/.test(arg))
      throw new Error(`Unknown argument ${arg}`);
  if (!command || command === "--help")
    console.log(
      "npm run source:tools -- capture --source=id --url=https://source/boats --output=data/fixture.html [--file=local.html]\nnpm run source:tools -- preview --source=id --url=https://source/boats --file=local.html [--observed-at=ISO]\nnpm run source:tools -- apply --review=SHA256\nCapture obeys robots/cache policy. Review generated redaction before sharing. Preview never writes listings; apply backs up and requires unchanged reviewed evidence.",
    );
  else if (command === "capture") {
    if (!value("source") || !value("url") || !value("output"))
      throw new Error("capture requires source/url/output");
    console.log(
      JSON.stringify(
        await captureSourceFixture({
          sourceId: value("source")!,
          url: value("url")!,
          target: value("output")!,
          inputFile: value("file"),
        }),
        null,
        2,
      ),
    );
  } else if (command === "preview") {
    if (!value("file")) throw new Error("preview requires a local --file");
    console.log(
      JSON.stringify(
        await previewSourceParse({
          sourceId: value("source"),
          url: value("url"),
          html: await readFile(value("file")!, "utf8"),
          observedAt:
            value("observed-at") ||
            (await stat(value("file")!)).mtime.toISOString(),
        }),
        null,
        2,
      ),
    );
  } else if (command === "apply")
    console.log(
      JSON.stringify(await applySourceParse(value("review") || ""), null, 2),
    );
  else throw new Error("Unknown source-tools command");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
