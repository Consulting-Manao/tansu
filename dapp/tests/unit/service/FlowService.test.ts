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

vi.mock("../../../src/utils/ipfsFunctions", () => ({
  packFilesToCar: packFilesToCarMock,
  uploadToIpfsProxy: uploadToIpfsProxyMock,
}));

vi.mock("../../../src/contracts/soroban_tansu", () => ({
  default: {
    options: {},
    register: registerMock,
    update_config: updateConfigMock,
  },
}));

vi.mock("../../../src/utils/store", () => ({
  connectedPublicKey: {
    get: connectedPublicKeyGetMock,
  },
}));

vi.mock("../../../src/service/StateService", () => ({
  loadedProjectId: loadedProjectIdMock,
}));

vi.mock("../../../src/service/TxService", () => ({
  signAssembledTransaction: signAssembledTransactionMock,
  sendSignedTransaction: sendSignedTransactionMock,
}));

vi.mock("../../../src/utils/contractErrors", () => ({
  checkSimulationError: checkSimulationErrorMock,
}));

import {
  createProjectFlow,
  updateConfigFlow,
  uploadAndSend,
} from "../../../src/service/FlowService";

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
    signAssembledTransactionMock.mockResolvedValue({ xdr: "signed-xdr" });
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

  it("forwards the attestation threshold when registering a project", async () => {
    await createProjectFlow({
      projectName: "example",
      tomlFile: createTomlFile(),
      githubRepoUrl: "https://github.com/group/project",
      maintainers: ["GMAINTAINER"],
      attestationThreshold: 75,
    });

    expect(registerMock).toHaveBeenCalledWith(
      expect.objectContaining({ attestation_threshold: 75 }),
    );
  });

  it("forwards the attestation threshold when updating project config", async () => {
    await updateConfigFlow({
      tomlFile: createTomlFile(),
      githubRepoUrl: "https://github.com/group/project",
      maintainers: ["GMAINTAINER"],
      attestationThreshold: 80,
    });

    expect(updateConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ attestation_threshold: 80 }),
    );
  });
});

describe("uploadAndSend", () => {
  const upload = {
    cid: "bafy-test-cid",
    carBlob: new Blob(["car"], { type: "application/vnd.ipld.car" }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    uploadToIpfsProxyMock.mockResolvedValue("bafy-test-cid");
    sendSignedTransactionMock.mockResolvedValue(42);
  });

  it("uploads with the signed envelope, then sends it", async () => {
    const onProgress = vi.fn();
    await expect(
      uploadAndSend({ xdr: "signed-xdr" }, upload, onProgress),
    ).resolves.toBe(42);

    expect(uploadToIpfsProxyMock).toHaveBeenCalledWith({
      ...upload,
      signedTxXdr: "signed-xdr",
    });
    expect(uploadToIpfsProxyMock.mock.invocationCallOrder[0]).toBeLessThan(
      sendSignedTransactionMock.mock.invocationCallOrder[0],
    );
    expect(onProgress.mock.calls).toEqual([[8], [9]]);
  });

  it("confirms a wallet-submitted transaction, then uploads with its hash", async () => {
    const onProgress = vi.fn();
    const hash = "d".repeat(64);
    await expect(uploadAndSend({ hash }, upload, onProgress)).resolves.toBe(42);

    expect(sendSignedTransactionMock).toHaveBeenCalledWith({ hash });
    expect(uploadToIpfsProxyMock).toHaveBeenCalledWith({
      ...upload,
      txHash: hash,
    });
    expect(sendSignedTransactionMock.mock.invocationCallOrder[0]).toBeLessThan(
      uploadToIpfsProxyMock.mock.invocationCallOrder[0],
    );
    expect(onProgress.mock.calls).toEqual([[8], [9]]);
  });

  it("says the transaction is on-chain when the late upload fails", async () => {
    uploadToIpfsProxyMock.mockRejectedValue(new Error("Filebase HTTP 502"));
    const hash = "e".repeat(64);

    await expect(uploadAndSend({ hash }, upload)).rejects.toThrow(
      `Transaction ${hash} is on-chain but its IPFS upload failed: Filebase HTTP 502`,
    );
  });

  it("only sends when there is nothing to upload", async () => {
    await uploadAndSend({ xdr: "signed-xdr" });

    expect(uploadToIpfsProxyMock).not.toHaveBeenCalled();
    expect(sendSignedTransactionMock).toHaveBeenCalledWith({
      xdr: "signed-xdr",
    });
  });
});
