import { QueryClient, type FetchQueryOptions } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  commitHistoryQuery,
  repoCommitQuery,
  repoHeadQuery,
  repoReadmeQuery,
} from "../../../src/service/RepositoryMetadataService";

const RADICLE_RID = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";

function createJsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A read as a page makes it, without waiting between retries. */
function read<T>(options: FetchQueryOptions<T, Error, T, any>): Promise<T> {
  return new QueryClient().query({ ...options, retryDelay: 0 });
}

describe("RepositoryMetadataService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("URL-encodes provider API path segments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse([
        {
          sha: "abc123",
          commit: {
            author: { name: "Alice", date: "2026-04-24T00:00:00Z" },
            message: "Initial commit",
          },
          html_url:
            "https://github.com/my%20org/na%C3%AFve%20repo/commit/abc123",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const history = await read(
      commitHistoryQuery("https://github.com/my%20org/na%C3%AFve%20repo"),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.github.com/repos/my%20org/na%C3%AFve%20repo/commits?page=1&per_page=30",
    );
    expect(history).toEqual([
      {
        date: "2026-04-24",
        commits: [
          {
            author: {
              html_url: "",
              name: "Alice",
            },
            commit_date: "2026-04-24T00:00:00Z",
            html_url:
              "https://github.com/my%20org/na%C3%AFve%20repo/commit/abc123",
            message: "Initial commit",
            sha: "abc123",
          },
        ],
      },
    ]);
  });

  it("retries transient failures with exponential backoff", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ error: "busy" }, 503))
      .mockResolvedValueOnce(createJsonResponse({ error: "slow down" }, 429))
      .mockResolvedValueOnce(
        createJsonResponse([
          {
            sha: "abc123",
            commit: {
              author: { name: "Alice", date: "2026-04-24T00:00:00Z" },
              message: "Initial commit",
            },
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      read(repoHeadQuery("https://github.com/example/project")),
    ).resolves.toBe("abc123");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-transient client errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ error: "forbidden" }, 403));
    vi.stubGlobal("fetch", fetchMock);

    // A failure is an error, not "no commits": it is not kept as an answer.
    await expect(
      read(repoHeadQuery("https://github.com/example/project")),
    ).rejects.toThrow("api.github.com API request failed with status 403");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches Radicle README content and resolves raw asset base URLs", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);

      if (
        url ===
        `https://seed.example/api/v1/repos/${encodeURIComponent(RADICLE_RID)}`
      ) {
        return Promise.resolve(
          createJsonResponse({
            payloads: {
              "xyz.radicle.project": {
                meta: { head: "abcdef1234567890" },
              },
            },
          }),
        );
      }

      if (
        url ===
        `https://seed.example/api/v1/repos/${encodeURIComponent(RADICLE_RID)}/blob/abcdef1234567890/README.md`
      ) {
        return Promise.resolve(
          createJsonResponse({
            binary: false,
            content: "# Hello from Radicle\n![Logo](docs/logo.png)",
          }),
        );
      }

      return Promise.resolve(createJsonResponse({ message: "Not found" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      read(
        repoReadmeQuery(
          `https://radicle.network/nodes/seed.example/${encodeURIComponent(RADICLE_RID)}`,
        ),
      ),
    ).resolves.toEqual({
      content: "# Hello from Radicle\n![Logo](docs/logo.png)",
      rawBaseUrl: `https://seed.example/raw/${encodeURIComponent(RADICLE_RID)}/abcdef1234567890`,
    });
  });

  it("fetches Radicle commit history and commit details from the public seed fallback", async () => {
    const committedAt = 1_710_000_000;
    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);

      if (
        url ===
        `https://iris.radicle.network/api/v1/repos/${encodeURIComponent(RADICLE_RID)}/commits?page=1&per_page=1`
      ) {
        return Promise.resolve(
          createJsonResponse([
            {
              id: "abc123",
              summary: "Initial commit",
              description: "Adds project scaffolding",
              author: { name: "Cloudhead" },
              committer: { time: committedAt },
            },
          ]),
        );
      }

      if (
        url ===
        `https://iris.radicle.network/api/v1/repos/${encodeURIComponent(RADICLE_RID)}/commits/abc123`
      ) {
        return Promise.resolve(
          createJsonResponse({
            commit: {
              id: "abc123",
              summary: "Initial commit",
              description: "Adds project scaffolding",
              author: {
                name: "Cloudhead",
                email: "cloudhead@example.com",
              },
              committer: {
                name: "Cloudhead",
                email: "cloudhead@example.com",
                time: committedAt,
              },
            },
          }),
        );
      }

      return Promise.resolve(createJsonResponse({ message: "Not found" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(read(repoHeadQuery(RADICLE_RID))).resolves.toBe("abc123");

    await expect(read(repoCommitQuery(RADICLE_RID, "abc123"))).resolves.toEqual(
      {
        sha: "abc123",
        html_url: `https://radicle.network/nodes/iris.radicle.network/${encodeURIComponent(RADICLE_RID)}`,
        commit: {
          message: "Initial commit\n\nAdds project scaffolding",
          author: {
            name: "Cloudhead",
            email: "cloudhead@example.com",
            date: "2024-03-09T16:00:00.000Z",
          },
          committer: {
            name: "Cloudhead",
            email: "cloudhead@example.com",
            date: "2024-03-09T16:00:00.000Z",
          },
        },
      },
    );
  });
});
