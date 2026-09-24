import { beforeEach, describe, expect, it, vi } from "vitest";

const { registerMock, updateConfigMock, sendMock } = vi.hoisted(() => ({
  registerMock: vi.fn(),
  updateConfigMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock("../../../src/contracts/soroban_tansu", () => ({
  tansuReads: {},
  tansuFor: () => ({ register: registerMock, update_config: updateConfigMock }),
}));

vi.mock("../../../src/service/TxService", () => ({
  packUpload: async () => ({ cid: "bafy-test-cid", carBlob: new Blob() }),
  sendTransaction: sendMock,
}));

vi.mock("../../../src/service/walletService", () => ({
  connectedAddress: () => "GTESTPUBLICKEY",
}));

import {
  registerProject,
  updateConfig,
} from "../../../src/service/ProjectService";
import { deriveProjectKey, projectKeyHex } from "../../../src/utils/projectKey";

const config = {
  tomlFile: new File(['PROJECT_TYPE = "SOFTWARE"'], "tansu.toml"),
  repositoryUrl: "https://gitlab.com/group/subgroup/project/-/tree/main/docs",
  maintainers: ["GMAINTAINER"],
};

describe("project writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerMock.mockResolvedValue("register-tx");
    updateConfigMock.mockResolvedValue("update-tx");
  });

  it("registers with the repository's canonical URL and the upload", async () => {
    await registerProject("example", { ...config, attestationThreshold: 75 });

    expect(registerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maintainer: "GTESTPUBLICKEY",
        name: "example",
        url: "https://gitlab.com/group/subgroup/project",
        ipfs: "bafy-test-cid",
        attestation_threshold: 75,
      }),
    );
    expect(sendMock).toHaveBeenCalledWith(
      "register-tx",
      expect.objectContaining({
        upload: expect.objectContaining({ cid: "bafy-test-cid" }),
        invalidate: [["projects"], ["project", projectKeyHex("example")]],
      }),
    );
  });

  it("updates the named project and refreshes it, its list and threshold", async () => {
    await updateConfig("example", config);

    expect(updateConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: deriveProjectKey("example"),
        url: "https://gitlab.com/group/subgroup/project",
        attestation_threshold: undefined,
      }),
    );
    const key = projectKeyHex("example");
    expect(sendMock).toHaveBeenCalledWith(
      "update-tx",
      expect.objectContaining({
        invalidate: [["project", key], ["projects"], ["threshold", key]],
      }),
    );
  });
});
