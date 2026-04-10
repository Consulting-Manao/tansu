import { describe, it, expect } from "vitest";
import { packFilesToCar } from "./ipfsFunctions";

describe("packFilesToCar", () => {
  it("returns CarPackResult with cid and carBlob for valid files", async () => {
    const mockFile = new File(["hello world"], "test.txt", {
      type: "text/plain",
    });
    const result = await packFilesToCar([mockFile]);
    expect(result).toHaveProperty("cid");
    expect(result).toHaveProperty("carBlob");
    expect(result.cid).toMatch(/^(bafy|Qm)/);
    expect(result.carBlob).toBeInstanceOf(Blob);
    expect(result.carBlob.type).toBe("application/vnd.ipld.car");
  });

  it("returns different CIDs for different content", async () => {
    const file1 = new File(["content A"], "a.txt", { type: "text/plain" });
    const file2 = new File(["content B"], "b.txt", { type: "text/plain" });
    const result1 = await packFilesToCar([file1]);
    const result2 = await packFilesToCar([file2]);
    expect(result1.cid).not.toBe(result2.cid);
  });
});
