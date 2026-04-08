#!/usr/bin/env node
import "dotenv/config";
import {
  Account,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { createDirectoryEncoderStream } from "ipfs-car";

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

async function calculateDirectoryCid(files) {
  const stream = createDirectoryEncoderStream(files);
  let rootCID;

  await stream.pipeTo(
    new WritableStream({
      write(block) {
        rootCID = block.cid.toString();
      },
    }),
  );

  if (!rootCID) {
    throw new Error("Failed to compute test CID");
  }
  return rootCID;
}

function buildSignedTestTransaction(signer) {
  const account = new Account(signer.publicKey(), "0");
  const transaction = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.manageData({
        name: "ipfs-test",
        value: "ok",
      }),
    )
    .setTimeout(60)
    .build();

  transaction.sign(signer);
  return transaction.toXDR();
}

async function test() {
  console.log(`Connecting to worker at: ${WORKER_URL}`);

  const testFile = new File(
    ["This is a test file uploaded via the IPFS delegation worker!"],
    "test.txt",
    { type: "text/plain" },
  );
  const files = [testFile];
  const cid = await calculateDirectoryCid(files);

  const signer = process.env.TEST_SIGNER_SECRET
    ? Keypair.fromSecret(process.env.TEST_SIGNER_SECRET)
    : Keypair.random();
  const signedTxXdr = buildSignedTestTransaction(signer);

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cid,
        signedTxXdr,
        files: await Promise.all(
          files.map(async (file) => ({
            name: file.name,
            type: file.type,
            content: arrayBufferToBase64(await file.arrayBuffer()),
          })),
        ),
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
