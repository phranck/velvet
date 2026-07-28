import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const executeFile = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "../../..");
const syncScript = join(repositoryRoot, "actions/sync-data/scripts/sync.sh");

async function git(repository: string, ...arguments_: string[]): Promise<string> {
  const result = await executeFile("git", arguments_, { cwd: repository });
  return result.stdout.trim();
}

async function writeFixtureFile(
  repository: string,
  path: string,
  contents: string,
): Promise<void> {
  const destination = join(repository, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents, "utf8");
}

async function createFixtureRepository(
  root: string,
  options: { history?: boolean } = {},
): Promise<string> {
  const remote = join(root, "consumer.git");
  const repository = join(root, "consumer");
  await executeFile("git", ["init", "--bare", remote]);
  await mkdir(repository, { recursive: true });
  await git(repository, "init", "--initial-branch=main");
  await git(repository, "config", "user.name", "Fixture Author");
  await git(repository, "config", "user.email", "fixture@example.invalid");
  await writeFixtureFile(
    repository,
    ".upptimerc.yml",
    "sites:\n  - name: Website\n    url: https://example.invalid/health\n",
  );
  if (options.history !== false) {
    await writeFixtureFile(
      repository,
      "history/summary.json",
      `${JSON.stringify([
        {
          name: "Website",
          slug: "website",
          status: "up",
          time: 100,
          dailyMinutesDown: {},
        },
      ])}\n`,
    );
    await writeFixtureFile(
      repository,
      "history/website.yml",
      "status: up\nresponseTime: 100\nlastUpdated: 2026-07-06T12:00:00.000Z\nstartTime: 2026-07-05T10:00:00.000Z\n",
    );
  }
  await writeFixtureFile(repository, "consumer.config.yml", "enabled: true\n");
  await git(repository, "add", ".upptimerc.yml", "consumer.config.yml", ".");
  await git(repository, "commit", "-m", "Initial Upptime fixture");
  await git(repository, "remote", "add", "origin", remote);
  await git(repository, "push", "--set-upstream", "origin", "main");
  return repository;
}

function contentResponse(contents: string): string {
  return JSON.stringify({
    content: Buffer.from(contents).toString("base64"),
    encoding: "base64",
  });
}

async function startGitHubApi(): Promise<{
  apiUrl: string;
  close: () => Promise<void>;
  setHistoryState: (state: "available" | "absent" | "missing-summary") => void;
  setIssues: (issues: Array<Record<string, unknown>>) => void;
  setSummary: (summary: string) => void;
}> {
  let issues: Array<Record<string, unknown>> = [];
  let historyState: "available" | "absent" | "missing-summary" = "available";
  let summary = JSON.stringify([
    {
      name: "Website",
      slug: "website",
      status: "up",
      time: 100,
      dailyMinutesDown: {},
    },
  ]);
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    response.setHeader("content-type", "application/json");

    if (historyState === "absent" && url.pathname.includes("/history")) {
      response.statusCode = 404;
      response.end(JSON.stringify({ message: "Not found" }));
      return;
    }

    if (historyState === "missing-summary") {
      if (url.pathname.endsWith("/history")) {
        response.end(JSON.stringify([]));
        return;
      }
      if (url.pathname.endsWith("/history/summary.json")) {
        response.statusCode = 404;
        response.end(JSON.stringify({ message: "Not found" }));
        return;
      }
    }

    if (url.pathname.endsWith("/.upptimerc.yml")) {
      response.end(
        contentResponse(
          "sites:\n  - name: Website\n    url: https://example.invalid/health\n",
        ),
      );
      return;
    }
    if (url.pathname.endsWith("/history/summary.json")) {
      response.end(contentResponse(summary));
      return;
    }
    if (url.pathname.endsWith("/history/website.yml")) {
      response.end(
        contentResponse(
          "status: up\nresponseTime: 100\nlastUpdated: 2026-07-06T12:00:00.000Z\nstartTime: 2026-07-05T10:00:00.000Z\n",
        ),
      );
      return;
    }
    if (url.pathname.endsWith("/commits")) {
      response.end(
        JSON.stringify([
          {
            sha: "history-1",
            commit: {
              message: "Website is up (200 in 100 ms) [upptime]",
              committer: { date: "2026-07-06T12:00:00.000Z" },
            },
          },
        ]),
      );
      return;
    }
    if (url.pathname.endsWith("/issues")) {
      response.end(JSON.stringify(issues));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ message: "Not found" }));
  });

  await new Promise<void>((resolvePromise) => {
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const port = typeof address === "object" && address !== null ? address.port : 0;

  return {
    apiUrl: `http://127.0.0.1:${port}`,
    setHistoryState: (nextHistoryState) => {
      historyState = nextHistoryState;
    },
    setIssues: (nextIssues) => {
      issues = nextIssues;
    },
    setSummary: (nextSummary) => {
      summary = nextSummary;
    },
    close: () =>
      new Promise<void>((resolvePromise, reject) => {
        server.close((error) => (error === undefined ? resolvePromise() : reject(error)));
      }),
  };
}

async function runSync(
  repository: string,
  apiUrl: string,
  output = "velvet-data/v1",
): Promise<void> {
  await executeFile("bash", [syncScript], {
    cwd: repository,
    env: {
      ...process.env,
      VELVET_ROOT: repositoryRoot,
      VELVET_WORKSPACE: repository,
      VELVET_OUTPUT: output,
      GITHUB_API_URL: apiUrl,
      GITHUB_REPOSITORY: "example/status",
      GITHUB_REF_NAME: "main",
      GITHUB_TOKEN: "fixture-token",
    },
  });
}

test("publishes all Velvet documents in one fixture repository commit", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "velvet-action-"));
  const api = await startGitHubApi();

  try {
    const repository = await createFixtureRepository(temporaryDirectory);
    await runSync(repository, api.apiUrl);

    assert.equal(await git(repository, "rev-list", "--count", "HEAD"), "2");
    assert.equal(
      await git(repository, "log", "-1", "--format=%an <%ae>%n%s"),
      "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>\n" +
        "chore(velvet): sync data [skip ci]",
    );
    assert.deepEqual(
      (await git(repository, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"))
        .split("\n")
        .sort(),
      [
        "velvet-data/v1/incidents.json",
        "velvet-data/v1/response-times.json",
        "velvet-data/v1/status.json",
      ],
    );
    assert.equal(
      (await readFile(join(repository, "velvet-data/v1/status.json"), "utf8"))
        .includes('"schemaVersion": 1'),
      true,
    );
  } finally {
    await api.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("publishes a valid no-history snapshot for a fresh repository", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "velvet-action-"));
  const api = await startGitHubApi();

  try {
    const repository = await createFixtureRepository(temporaryDirectory, {
      history: false,
    });
    const sourceConfig = await readFile(join(repository, ".upptimerc.yml"), "utf8");
    const consumerConfig = await readFile(
      join(repository, "consumer.config.yml"),
      "utf8",
    );
    api.setHistoryState("absent");

    await runSync(repository, api.apiUrl);

    const status = JSON.parse(
      await readFile(join(repository, "velvet-data/v1/status.json"), "utf8"),
    );
    const responseTimes = JSON.parse(
      await readFile(
        join(repository, "velvet-data/v1/response-times.json"),
        "utf8",
      ),
    );
    const incidents = JSON.parse(
      await readFile(join(repository, "velvet-data/v1/incidents.json"), "utf8"),
    );
    assert.deepEqual(
      (await git(repository, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"))
        .split("\n")
        .sort(),
      [
        "velvet-data/v1/incidents.json",
        "velvet-data/v1/response-times.json",
        "velvet-data/v1/status.json",
      ],
    );
    assert.equal(status.services[0]?.status, "unknown");
    assert.equal(status.services[0]?.checks[0]?.checkedAt, null);
    assert.deepEqual(responseTimes.series, []);
    assert.deepEqual(incidents.events, []);
    assert.equal(await readFile(join(repository, ".upptimerc.yml"), "utf8"), sourceConfig);
    assert.equal(
      await readFile(join(repository, "consumer.config.yml"), "utf8"),
      consumerConfig,
    );
    await assert.rejects(readFile(join(repository, "history/summary.json"), "utf8"));
  } finally {
    await api.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("keeps the last snapshot when existing history lacks its summary", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "velvet-action-"));
  const api = await startGitHubApi();

  try {
    const repository = await createFixtureRepository(temporaryDirectory);
    await runSync(repository, api.apiUrl);
    const publishedCommit = await git(repository, "rev-parse", "HEAD");
    const publishedFiles = await Promise.all(
      ["status.json", "response-times.json", "incidents.json"].map((fileName) =>
        readFile(join(repository, "velvet-data/v1", fileName), "utf8"),
      ),
    );
    api.setHistoryState("missing-summary");

    await assert.rejects(runSync(repository, api.apiUrl));

    assert.equal(await git(repository, "rev-parse", "HEAD"), publishedCommit);
    assert.deepEqual(
      await Promise.all(
        ["status.json", "response-times.json", "incidents.json"].map((fileName) =>
          readFile(join(repository, "velvet-data/v1", fileName), "utf8"),
        ),
      ),
      publishedFiles,
    );
  } finally {
    await api.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("skips a commit when normalized output is unchanged", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "velvet-action-"));
  const api = await startGitHubApi();

  try {
    const repository = await createFixtureRepository(temporaryDirectory);
    await runSync(repository, api.apiUrl);
    await runSync(repository, api.apiUrl);

    assert.equal(await git(repository, "rev-list", "--count", "HEAD"), "2");
  } finally {
    await api.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("changes only incidents.json for an incident-only update", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "velvet-action-"));
  const api = await startGitHubApi();

  try {
    const repository = await createFixtureRepository(temporaryDirectory);
    await runSync(repository, api.apiUrl);
    api.setIssues([
      {
        number: 42,
        title: "Website is down",
        body: "Investigating the outage.",
        state: "open",
        created_at: "2026-07-07T10:00:00.000Z",
        closed_at: null,
        labels: [{ name: "status" }, { name: "website" }],
      },
    ]);

    await runSync(repository, api.apiUrl);

    assert.equal(
      await git(repository, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"),
      "velvet-data/v1/incidents.json",
    );
    assert.equal(
      JSON.parse(
        await readFile(join(repository, "velvet-data/v1/incidents.json"), "utf8"),
      ).events.length,
      1,
    );
  } finally {
    await api.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("refuses to overwrite a newer remote snapshot", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "velvet-action-"));
  const api = await startGitHubApi();

  try {
    const repository = await createFixtureRepository(temporaryDirectory);
    const newerRepository = join(temporaryDirectory, "newer-consumer");
    await executeFile("git", ["clone", join(temporaryDirectory, "consumer.git"), newerRepository]);
    await git(newerRepository, "config", "user.name", "Concurrent Author");
    await git(newerRepository, "config", "user.email", "concurrent@example.invalid");
    await writeFixtureFile(newerRepository, "newer-source.txt", "newer\n");
    await git(newerRepository, "add", "newer-source.txt");
    await git(newerRepository, "commit", "-m", "Advance source data");
    await git(newerRepository, "push", "origin", "main");
    const newerCommit = await git(newerRepository, "rev-parse", "HEAD");

    await assert.rejects(runSync(repository, api.apiUrl));

    assert.equal(
      await git(join(temporaryDirectory, "consumer.git"), "rev-parse", "main"),
      newerCommit,
    );
    await assert.rejects(
      git(
        join(temporaryDirectory, "consumer.git"),
        "show",
        "main:velvet-data/v1/status.json",
      ),
    );
  } finally {
    await api.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("rejects output paths that could replace consumer configuration", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "velvet-action-"));
  const api = await startGitHubApi();

  try {
    const repository = await createFixtureRepository(temporaryDirectory);

    await assert.rejects(runSync(repository, api.apiUrl, "consumer.config.yml"));

    assert.equal(await git(repository, "rev-list", "--count", "HEAD"), "1");
    assert.equal(await git(repository, "status", "--porcelain"), "");
    assert.equal(
      await readFile(join(repository, "consumer.config.yml"), "utf8"),
      "enabled: true\n",
    );

    await assert.rejects(runSync(repository, api.apiUrl, ".git/v1"));
    await assert.rejects(
      readFile(join(repository, ".git/v1/status.json"), "utf8"),
    );
  } finally {
    await api.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("does not commit or replace valid data when adapter input is invalid", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "velvet-action-"));
  const api = await startGitHubApi();

  try {
    const repository = await createFixtureRepository(temporaryDirectory);
    await runSync(repository, api.apiUrl);
    const publishedCommit = await git(repository, "rev-parse", "HEAD");
    const publishedStatus = await readFile(
      join(repository, "velvet-data/v1/status.json"),
      "utf8",
    );
    api.setSummary("{");

    await assert.rejects(runSync(repository, api.apiUrl));

    assert.equal(await git(repository, "rev-parse", "HEAD"), publishedCommit);
    assert.equal(await git(repository, "status", "--porcelain"), "");
    assert.equal(
      await readFile(join(repository, "velvet-data/v1/status.json"), "utf8"),
      publishedStatus,
    );
  } finally {
    await api.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
