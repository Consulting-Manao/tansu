import { beforeEach, describe, expect, it, vi } from "vitest";
import { Buffer } from "buffer";

const {
  packFilesToCarMock,
  uploadToIpfsProxyMock,
  registerMock,
  updateConfigMock,
  connectedPublicKeyGetMock,
  loadedProjectIdMock,
  signAssembledTransactionMock,
  sendSignedTransactionMock,
  checkSimulationErrorMock,
} = vi.hoisted(() => ({
  packFilesToCarMock: vi.fn(),
  uploadToIpfsProxyMock: vi.fn(),
  registerMock: vi.fn(),
  updateConfigMock: vi.fn(),
  connectedPublicKeyGetMock: vi.fn(),
  loadedProjectIdMock: vi.fn(),
  signAssembledTransactionMock: vi.fn(),
  sendSignedTransactionMock: vi.fn(),
  checkSimulationErrorMock: vi.fn(),
}));

vi.mock("../utils/ipfsFunctions", () => ({
  packFilesToCar: packFilesToCarMock,
  uploadToIpfsProxy: uploadToIpfsProxyMock,
}));

vi.mock("../contracts/soroban_tansu", () => ({
  default: {
    options: {},
    register: registerMock,
    update_config: updateConfigMock,
  },
}));

vi.mock("../utils/store", () => ({
  connectedPublicKey: {
    get: connectedPublicKeyGetMock,
  },
}));

vi.mock("./StateService", () => ({
  loadedProjectId: loadedProjectIdMock,
}));

vi.mock("./TxService", () => ({
  signAssembledTransaction: signAssembledTransactionMock,
  sendSignedTransaction: sendSignedTransactionMock,
}));

vi.mock("../utils/contractErrors", () => ({
  checkSimulationError: checkSimulationErrorMock,
}));

import { createProjectFlow, updateConfigFlow } from "./FlowService";

function createTomlFile() {
  return new File(['PROJECT_TYPE = "SOFTWARE"'], "project.toml", {
    type: "text/plain",
  });
}

describe("FlowService repository URL persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    packFilesToCarMock.mockResolvedValue({
      cid: "bafy-test-cid",
      carBlob: new Blob(["car"], { type: "application/vnd.ipld.car" }),
    });
    uploadToIpfsProxyMock.mockResolvedValue("bafy-test-cid");
    connectedPublicKeyGetMock.mockReturnValue("GTESTPUBLICKEY");
    loadedProjectIdMock.mockReturnValue(Buffer.from("1234", "hex"));
    registerMock.mockResolvedValue({ simulation: {} });
    updateConfigMock.mockResolvedValue({ simulation: {} });
    signAssembledTransactionMock.mockResolvedValue("signed-xdr");
    sendSignedTransactionMock.mockResolvedValue(true);
  });

  it("normalizes repository URLs before registering a project", async () => {
    await createProjectFlow({
      projectName: "example",
      tomlFile: createTomlFile(),
      githubRepoUrl:
        "https://gitlab.com/group/subgroup/project/-/blob/main/README.md",
      maintainers: ["GMAINTAINER"],
    });

    expect(registerMock).toHaveBeenCalledWith({
      maintainer: "GTESTPUBLICKEY",
      name: "example",
      maintainers: ["GMAINTAINER"],
      url: "https://gitlab.com/group/subgroup/project",
      ipfs: "bafy-test-cid",
    });
  });

  it("normalizes repository URLs before updating project config", async () => {
    await updateConfigFlow({
      tomlFile: createTomlFile(),
      githubRepoUrl:
        "https://gitlab.com/group/subgroup/project/-/tree/main/docs",
      maintainers: ["GMAINTAINER"],
    });

    expect(updateConfigMock).toHaveBeenCalledWith({
      maintainer: "GTESTPUBLICKEY",
      key: Buffer.from("1234", "hex"),
      maintainers: ["GMAINTAINER"],
      url: "https://gitlab.com/group/subgroup/project",
      ipfs: "bafy-test-cid",
    });
  });
});
