/**
 * Serves the configurator locally, answering the routes the service answers.
 *
 * The configurator asks the setup service who is signed in and what they may
 * configure, and the setup service needs a GitHub App, a registered OAuth
 * client, and a session store to answer either question. None of that is worth
 * standing up to look at an interface, so this answers both routes with an
 * invented account and an invented listing.
 *
 * What it serves is the built application rather than a dev server, for the
 * same reason the browser tests do: that is what a visitor gets, and a dev
 * server reloads the page once whilst its dependency optimiser catches up.
 * Build first, then start this.
 *
 * ```bash
 * bun run --cwd site configurator:build
 * bun run --cwd site configurator:serve
 * ```
 *
 * `VELVET_FAKE_INSTALLATIONS` decides what the listing holds: a number, or
 * `none` for an account with nothing installed, or `truncated` for a listing
 * that stopped at its own limit.
 */
import { resolve } from "node:path";

const PORT = Number(process.env.PORT ?? 5177);
const ROOT = resolve(import.meta.dirname, "../../config");

/** The account this pretends to be signed in as. */
const SESSION = {
  authenticated: true,
  csrfToken: "C".repeat(43),
  user: {
    login: "velvet-user",
    avatarUrl: "https://avatars.githubusercontent.com/u/1",
  },
};

/**
 * Invents a listing of the requested size.
 *
 * The names are ordinary rather than clever, because a screen full of joke
 * repository names is harder to read a layout from than one full of plausible
 * ones.
 */
function installations(count: number): unknown[] {
  const names = [
    "status",
    "status-page",
    "uptime",
    "acme-status",
    "internal-status",
    "edge-status",
  ];
  return Array.from({ length: count }, (_, index) => ({
    installationId: 7 + index,
    repositoryId: 100 + index,
    owner: "velvet-user",
    name: names[index % names.length]!,
    htmlUrl: `https://github.com/velvet-user/${names[index % names.length]}`,
    installedVersion: index % 3 === 2 ? "1.8.0" : "1.9.0",
  }));
}

const requested = process.env.VELVET_FAKE_INSTALLATIONS ?? "2";
const listing =
  requested === "none"
    ? { repositories: [], truncated: false }
    : requested === "truncated"
      ? { repositories: installations(4), truncated: true }
      : { repositories: installations(Number(requested) || 1), truncated: false };

if (!(await Bun.file(resolve(ROOT, "index.html")).exists())) {
  console.error(
    "Nothing is built yet. Run `bun run --cwd site configurator:build` first.",
  );
  process.exit(1);
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/session") return Response.json(SESSION);
    if (url.pathname === "/api/installations") return Response.json(listing);
    // The service serves the applications under their own name, so the
    // monitor's frame addresses `/config/themes/…`. Answered here under both
    // that path and the bare one, so what the frame asks for is what arrives.
    const requested = url.pathname.replace(/^\/config\//, "/");
    const path = requested === "/" ? "index.html" : requested.slice(1);
    const file = Bun.file(resolve(ROOT, path));
    return (await file.exists())
      ? new Response(file)
      : new Response(null, { status: 404 });
  },
});

console.log(`Configurator on http://localhost:${server.port}`);
console.log(
  `Signed in as ${SESSION.user.login}, with ${listing.repositories.length} installation${listing.repositories.length === 1 ? "" : "s"}${listing.truncated ? " and a truncated listing" : ""}.`,
);
