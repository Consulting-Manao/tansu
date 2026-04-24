import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createJsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockImmediateTimers() {
  return vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    callback: TimerHandler,
  ) => {
    if (typeof callback === "function") {
      callback();
    }

    return 0;
  }) as unknown as typeof setTimeout);
}

async function loadRepositoryMetadataService() {
  return import("./RepositoryMetadataService");
}

describe("RepositoryMetadataService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

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

    const { getCommitHistory } = await loadRepositoryMetadataService();

    const history = await getCommitHistory(
      "https://github.com/my%20org/na%C3%AFve%20repo",
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
    const timeoutSpy = mockImmediateTimers();
    vi.stubGlobal("fetch", fetchMock);

    const { getLatestCommitHash } = await loadRepositoryMetadataService();

    await expect(
      getLatestCommitHash("https://github.com/example/project"),
    ).resolves.toBe("abc123");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(timeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 250);
    expect(timeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 500);
  });

  it("does not retry non-transient client errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ error: "forbidden" }, 403));
    const timeoutSpy = mockImmediateTimers();
    vi.stubGlobal("fetch", fetchMock);

    const { getLatestCommitHash } = await loadRepositoryMetadataService();

    await expect(
      getLatestCommitHash("https://github.com/example/project"),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(timeoutSpy).not.toHaveBeenCalled();
  });

  it("uses a short-lived cache for successful metadata responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse([
        {
          sha: "cached123",
          commit: {
            author: { name: "Alice", date: "2026-04-24T00:00:00Z" },
            message: "Cached commit",
          },
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getLatestCommitHash } = await loadRepositoryMetadataService();

    await expect(
      getLatestCommitHash("https://github.com/example/project"),
    ).resolves.toBe("cached123");
    await expect(
      getLatestCommitHash("https://github.com/example/project"),
    ).resolves.toBe("cached123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
