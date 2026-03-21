import test from "node:test";
import assert from "node:assert/strict";

import { handleApiRequest, parseRepoUrl } from "./gitProxy.ts";

test("parseRepoUrl supports GitHub HTTPS URLs", () => {
  const repo = parseRepoUrl("https://github.com/example/project.git");
  assert.equal(repo.provider, "github");
  assert.equal(repo.owner, "example");
  assert.equal(repo.repo, "project");
  assert.equal(repo.normalizedUrl, "https://github.com/example/project");
});

test("parseRepoUrl supports GitLab nested group URLs", () => {
  const repo = parseRepoUrl("https://gitlab.com/group/subgroup/project");
  assert.equal(repo.provider, "gitlab");
  assert.equal(repo.owner, "subgroup");
  assert.equal(repo.repo, "project");
  assert.equal(repo.projectPath, "group/subgroup/project");
});

test("parseRepoUrl supports SSH URLs", () => {
  const repo = parseRepoUrl("git@codeberg.org:owner/project.git");
  assert.equal(repo.provider, "gitea");
  assert.equal(repo.owner, "owner");
  assert.equal(repo.repo, "project");
});

test("handleApiRequest returns normalized GitHub history", async () => {
  const response = await handleApiRequest(
    {
      action: "history",
      repoUrl: "https://github.com/example/project",
      page: 1,
      perPage: 1,
    },
    {},
    async () =>
      new Response(
        JSON.stringify([
          {
            sha: "abc123",
            html_url: "https://github.com/example/project/commit/abc123",
            commit: {
              message: "Initial commit",
              author: {
                name: "Alice",
                email: "alice@example.com",
                date: "2026-03-16T00:00:00Z",
              },
              committer: {
                name: "Alice",
                email: "alice@example.com",
                date: "2026-03-16T00:00:00Z",
              },
            },
          },
        ]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    commits: Array<{ sha: string; message: string; authorName: string }>;
  };
  assert.equal(body.commits.length, 1);
  assert.equal(body.commits[0]?.sha, "abc123");
  assert.equal(body.commits[0]?.message, "Initial commit");
  assert.equal(body.commits[0]?.authorName, "Alice");
});

test("handleApiRequest decodes gitea readme payloads", async () => {
  const response = await handleApiRequest(
    {
      action: "readme",
      repoUrl: "https://codeberg.org/example/project",
    },
    {},
    async () =>
      new Response(
        JSON.stringify({
          content: "IyBIZWxsbyBUYW5zdQo=",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as { content: string };
  assert.equal(body.content, "# Hello Tansu\n");
});

test("handleApiRequest rejects unsupported hosts", async () => {
  const response = await handleApiRequest(
    {
      action: "latest-hash",
      repoUrl: "https://example.com/owner/repo",
    },
    {},
  );

  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /Unsupported repository host/);
});

test("handleApiRequest normalizes Bitbucket commit responses", async () => {
  const response = await handleApiRequest(
    {
      action: "commit",
      repoUrl: "https://bitbucket.org/example/project",
      sha: "abc123",
    },
    {},
    async () =>
      new Response(
        JSON.stringify({
          hash: "abc123",
          message: "Bitbucket commit",
          date: "2026-03-16T00:00:00Z",
          author: {
            user: {
              display_name: "Alice",
            },
          },
          links: {
            html: {
              href: "https://bitbucket.org/example/project/commits/abc123",
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    sha: string;
    html_url?: string;
    commit: { message: string; author: { name: string } };
  };
  assert.equal(body.sha, "abc123");
  assert.equal(
    body.html_url,
    "https://bitbucket.org/example/project/commits/abc123",
  );
  assert.equal(body.commit.message, "Bitbucket commit");
  assert.equal(body.commit.author.name, "Alice");
});
