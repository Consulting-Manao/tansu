#!/usr/bin/env node
import {
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { createDirectoryEncoderStream, CAREncoderStream } from "ipfs-car";

const DEV_URL = "https://ipfs-testnet.tansu.dev";
const PROD_URL = "https://ipfs.tansu.dev";
const ENV = process.env.ENV || "LOCAL";

let WORKER_URL =
  process.env.PUBLIC_DELEGATION_API_URL || "http://localhost:8787";
if (ENV === "DEV") {
  WORKER_URL = DEV_URL;
} else if (ENV === "PROD") {
  WORKER_URL = PROD_URL;
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function packFilesToCar(files) {
  const stream = createDirectoryEncoderStream(files);
  let rootCID;
  const blocks = [];

  await stream.pipeTo(
    new WritableStream({
      write(block) {
        blocks.push(block);
        rootCID = block.cid.toString();
      },
    }),
  );

  if (!rootCID) {
    throw new Error("Failed to compute test CID");
  }

  const carEncoder = new CAREncoderStream([blocks[blocks.length - 1].cid]);
  const chunks = [];
  await new ReadableStream({
    pull(controller) {
      if (blocks.length > 0) {
        controller.enqueue(blocks.shift());
      } else {
        controller.close();
      }
    },
  })
    .pipeThrough(carEncoder)
    .pipeTo(
      new WritableStream({
        write(chunk) {
          chunks.push(chunk);
        },
      }),
    );

  return {
    cid: rootCID,
    car: new Blob(chunks, { type: "application/vnd.ipld.car" }),
  };
}

// The Tansu contract the worker checks uploads against (testnet by default).
const TANSU_CONTRACT_ID =
  process.env.TANSU_CONTRACT_ID ||
  "CBXKUSLQPVF35FYURR5C42BPYA5UOVDXX2ELKIM2CAJMCI6HXG2BHGZA";

const RPC_URL =
  process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || Networks.TESTNET;

/**
 * A signed Tansu call recording `cid`, as the dapp sends it: simulated, its
 * authorizations attached, signed; never submitted. The worker simulates it
 * again, so the signer must exist on the network.
 */
async function buildSignedTestTransaction(signer, cid) {
  const server = new rpc.Server(RPC_URL);
  const account = await server.getAccount(signer.publicKey());
  const transaction = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: TANSU_CONTRACT_ID,
        function: "add_member",
        args: [
          nativeToScVal(signer.publicKey(), { type: "address" }),
          nativeToScVal(cid, { type: "string" }),
          xdr.ScVal.scvVoid(),
          xdr.ScVal.scvVoid(),
          xdr.ScVal.scvVoid(),
        ],
      }),
    )
    .setTimeout(60)
    .build();

  const assembled = rpc
    .assembleTransaction(
      transaction,
      await server.simulateTransaction(transaction),
    )
    .build();
  assembled.sign(signer);
  return assembled.toXDR();
}

async function test() {
  console.log(`Connecting to worker at: ${WORKER_URL}`);

  const testFile = new File(
    [`Uploaded via the IPFS delegation worker at ${new Date().toISOString()}`],
    "test.txt",
    { type: "text/plain" },
  );
  const { cid, car } = await packFilesToCar([testFile]);

  // Without a funded account of yours, friendbot funds a new one (testnet).
  const signer = process.env.TEST_SIGNER_SECRET
    ? Keypair.fromSecret(process.env.TEST_SIGNER_SECRET)
    : Keypair.random();
  if (!process.env.TEST_SIGNER_SECRET) {
    await fetch(`https://friendbot.stellar.org/?addr=${signer.publicKey()}`);
  }
  const signedTxXdr = await buildSignedTestTransaction(signer, cid);

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cid,
        signedTxXdr,
        car: arrayBufferToBase64(await car.arrayBuffer()),
      }),
    });

    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    console.log("\n📊 Status:", res.status);
    console.log("📄 Response:", JSON.stringify(data, null, 2));

    if (!res.ok) {
      throw new Error(`Worker returned HTTP status ${res.status}`);
    }

    if (!data?.success) {
      throw new Error(
        `Upload failed. Proxy reported failure: ${JSON.stringify(data)}`,
      );
    }

    console.log("\n✅ Upload request completed successfully!");
    console.log("🔑 CID returned by proxy:", data.cid);
  } catch (err) {
    console.error("\n❌ Test failed:", err);
    process.exit(1);
  }
}

test();
