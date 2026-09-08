import { it, expect } from "vitest";
import { publicUrl } from "../server/network";
it("rejects local network collection and credential-bearing URLs", async () => {
  await expect(publicUrl("http://127.0.0.1/private")).rejects.toThrow(
    /Private/,
  );
  await expect(publicUrl("http://[::1]/private")).rejects.toThrow(/Private/);
  await expect(publicUrl("https://user:pass@example.com")).rejects.toThrow(
    /without credentials/,
  );
  await expect(publicUrl("file:///etc/passwd")).rejects.toThrow(/HTTP/);
});
