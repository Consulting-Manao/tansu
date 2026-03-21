import type { Env } from "./gitProxy";
import { getCorsHeaders, handleApiRequest } from "./gitProxy";

export type { Env } from "./gitProxy";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const corsHeaders = getCorsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    let body: Record<string, unknown> = {};

    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const response = await handleApiRequest(body, env);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      headers.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  },
};