export interface Env {
  FILEBASE_TOKEN: string; // Filebase IPFS API Token (S3 or API token)
  PINATA_JWT: string;     // Pinata API JWT
  ALLOWED_ORIGINS?: string; // Optional comma-separated list of allowed origins
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origins = env.ALLOWED_ORIGINS || "*";

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": origins,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-expected-cid",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ success: false, error: "Method not allowed. Use POST." }), { 
        status: 405,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origins }
      });
    }

    const expectedCid = request.headers.get("x-expected-cid");
    if (!expectedCid) {
      return new Response(JSON.stringify({ success: false, error: "Missing x-expected-cid header" }), { 
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origins }
      });
    }

    const contentType = request.headers.get("Content-Type");
    if (!contentType?.includes("application/vnd.ipld.car")) {
       return new Response(JSON.stringify({ success: false, error: "Invalid Content-Type. Expected application/vnd.ipld.car" }), { 
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origins }
      });
    }

    let carBlob: Blob;
    try {
      carBlob = await request.blob();
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: "Failed to read request body" }), { 
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origins }
      });
    }

    if (carBlob.size === 0) {
      return new Response(JSON.stringify({ success: false, error: "Empty request body" }), { 
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origins }
      });
    }

    // --- 1. Primary: Filebase CAR Upload ---
    const filebaseUpload = async () => {
      try {
        const response = await fetch("https://api.filebase.io/v1/ipfs/car", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.FILEBASE_TOKEN}`,
          },
          body: carBlob,
        });

        if (!response.ok) {
           const text = await response.text();
           return { ok: false, error: `HTTP ${response.status}: ${text}`, name: "filebase" };
        }

        const data: any = await response.json();
        const returnedCid = data.cid || data.CID;

        if (returnedCid && returnedCid !== expectedCid) {
           return { ok: false, error: `CID mismatch. Expected ${expectedCid}, got ${returnedCid}`, name: "filebase" };
        }

        return { ok: true, status: response.status, name: "filebase", cid: returnedCid };
      } catch (e: any) {
        return { ok: false, error: e.message, name: "filebase" };
      }
    };

    // --- 2. Backup: Pinata CAR Upload ---
    const pinataUpload = async (retries = 2): Promise<any> => {
      const formData = new FormData();
      formData.append("file", carBlob, `${expectedCid}.car`);
      
      try {
        const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.PINATA_JWT}`,
          },
          body: formData,
        });

        if (!response.ok) {
          if (retries > 0) return pinataUpload(retries - 1);
          const text = await response.text();
          return { ok: false, error: `HTTP ${response.status}: ${text}`, name: "pinata" };
        }
        
        const data: any = await response.json();
        const returnedCid = data.IpfsHash;

        if (returnedCid && returnedCid !== expectedCid) {
           return { ok: false, error: `CID mismatch. Expected ${expectedCid}, got ${returnedCid}`, name: "pinata" };
        }

        return { ok: true, status: response.status, name: "pinata", cid: returnedCid };
      } catch (e: any) {
        if (retries > 0) return pinataUpload(retries - 1);
        return { ok: false, error: e.message, name: "pinata" };
      }
    };

    // Run uploads in parallel
    const [fbResult, pnResult] = await Promise.all([
      filebaseUpload(),
      pinataUpload(),
    ]);

    const success = fbResult.ok || pnResult.ok;
    
    // Detailed error if everything failed
    let combinedError = "";
    if (!success) {
      combinedError = `All providers failed. Filebase: ${fbResult.error} | Pinata: ${pnResult.error}`;
    }

    return new Response(JSON.stringify({
      success,
      filebase: fbResult.ok,
      pinata: pnResult.ok,
      error: combinedError || undefined,
      providers: {
        filebase: fbResult,
        pinata: pnResult,
      },
      cid: expectedCid,
    }), {
      status: success ? 200 : 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origins,
      },
    });
  },
};
