/**
 * What one Stellar account may have the worker pin in a day.
 *
 * One Durable Object per account holds its usage. A Durable Object takes its
 * requests one storage step at a time, so parallel uploads of one account
 * cannot each see room that only one of them can use.
 */

export const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
export const QUOTA_UPLOADS = 50;
export const QUOTA_BYTES = 100 * 1024 * 1024;

interface Usage {
  /** When the window opened: the account's first upload since the last one. */
  since: number;
  bytes: number;
  cids: string[];
}

interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}

/**
 * `reserve` before an upload, `release` if it fails. An upload of a CID the
 * account already has in its window costs nothing, so a retry is free.
 */
export class UploadQuota {
  constructor(private readonly state: { storage: Storage }) {}

  async fetch(request: Request): Promise<Response> {
    const { action, cid, bytes } = (await request.json()) as {
      action: "reserve" | "release";
      cid: string;
      bytes: number;
    };
    const now = Date.now();
    const stored = await this.state.storage.get<Usage>("usage");
    const usage =
      stored && now - stored.since < QUOTA_WINDOW_MS
        ? stored
        : { since: now, bytes: 0, cids: [] };

    if (action === "release") {
      if (usage.cids.includes(cid)) {
        usage.cids = usage.cids.filter((c) => c !== cid);
        usage.bytes = Math.max(0, usage.bytes - bytes);
        await this.state.storage.put("usage", usage);
      }
      return Response.json({ ok: true });
    }

    if (usage.cids.includes(cid)) return Response.json({ ok: true });
    if (
      usage.cids.length >= QUOTA_UPLOADS ||
      usage.bytes + bytes > QUOTA_BYTES
    ) {
      return Response.json({
        ok: false,
        retryAfter: Math.ceil((usage.since + QUOTA_WINDOW_MS - now) / 1000),
      });
    }
    usage.cids.push(cid);
    usage.bytes += bytes;
    await this.state.storage.put("usage", usage);
    return Response.json({ ok: true });
  }
}
