/**
 * Runs the configurator against a service that is not there.
 *
 * The configurator asks the setup service who is signed in and what they may
 * configure, and the setup service needs a GitHub App, a registered OAuth
 * client and a session store to answer either question. None of that is worth
 * standing up to look at an interface, so this answers both routes with an
 * invented account and an invented listing.
 *
 * A development server rather than the built copy, because the interface is
 * changed a great deal whilst somebody watches it, and a build between every
 * change costs more than it saves. What ships is proved by the browser tests,
 * which build the application themselves.
 *
 * ```bash
 * bun run --cwd site configurator:serve
 * ```
 *
 * `VELVET_FAKE_INSTALLATIONS` decides what the listing holds: a number, or
 * `none` for an account with nothing installed, or `truncated` for a listing
 * that stopped at its own limit.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { createServer, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

import { phosphorWoff2Only } from "../vite.static-tool.js";

const PORT = Number(process.env.PORT ?? 5177);
const SITE_ROOT = resolve(import.meta.dirname, "..");

/** Where the built themes are, which is where the monitor's frame reads from. */
const THEMES_ROOT = resolve(SITE_ROOT, "../config/themes");

/** The account this pretends to be signed in as. */
const SESSION = {
  authenticated: true,
  csrfToken: "C".repeat(43),
  user: {
    login: "velvet-user",
    avatarUrl: "https://avatars.githubusercontent.com/u/1",
    // A name as well as a login, because the account menu shows the name and
    // falls back on the login, and only one of those two states is worth
    // looking at by default.
    name: "Velvet User",
    email: "velvet-user@example.com",
  },
};

/**
 * Invents a listing of the requested size.
 *
 * The names are ordinary rather than clever, because a screen full of joke
 * repository names is harder to read a layout from than one full of plausible
 * ones.
 *
 * @param count - How many installations to invent.
 * @returns The listing, in the shape the service answers with.
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

/**
 * What one invented installation is published in.
 *
 * Two answers rather than one, so switching between installations is worth
 * doing whilst looking at the interface: the first carries the theme with a
 * feature set on it, and the next carries another theme entirely.
 *
 * @param repositoryId - The repository being asked about.
 * @returns The theme and what is set on it, in the shape the service answers.
 */
function publishedConfiguration(repositoryId: number): unknown {
  return repositoryId % 2 === 0
    ? {
        theme: "velvet",
        themeSettings: { chartWash: false },
        responseChart: true,
        defaultRange: "30d",
      }
    : {
        theme: "retro-chassis",
        themeSettings: {},
        responseChart: true,
        defaultRange: "90d",
      };
}

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

/**
 * Answers what the setup service answers, and nothing else.
 *
 * Three things: the two routes the configurator opens with, and the themes the
 * monitor frames. The themes are the built ones rather than something this
 * makes up, because the frame is a document with its own address in production
 * too and nothing about it is worth having a second version of.
 *
 * @returns The plugin, which only takes part whilst the server is running.
 */
function pretendService(): Plugin {
  return {
    name: "velvet-configurator-pretend-service",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? "/").split("?")[0]!;

        if (path === "/api/session" || path === "/api/installations") {
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(
            JSON.stringify(path === "/api/session" ? SESSION : listing),
          );
          return;
        }

        // What the invented installation is published in. Answered as a real
        // one is, so the configurator opens on a theme rather than on the
        // first one in the catalogue, and a second installation answers with
        // a different theme so switching between them is worth doing.
        if (path === "/api/configuration") {
          const which = Number(
            new URL(request.url ?? "/", "http://localhost").searchParams.get(
              "repository",
            ),
          );
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify(publishedConfiguration(which)));
          return;
        }

        // The service serves the applications under their own name, so the
        // frame asks for `/config/themes/…`. Answered from the built themes,
        // which `configurator:themes` writes.
        if (path.startsWith("/config/themes/")) {
          const file = resolve(THEMES_ROOT, path.slice("/config/themes/".length));
          if (!file.startsWith(`${THEMES_ROOT}/`)) {
            response.statusCode = 403;
            response.end();
            return;
          }
          void stat(file).then(
            () => {
              const type = CONTENT_TYPES[extname(file)];
              if (type) response.setHeader("Content-Type", type);
              createReadStream(file).pipe(response);
            },
            () => {
              response.statusCode = 404;
              response.end();
            },
          );
          return;
        }

        // The entry is named after the application, so a visit to the root
        // would otherwise find no document at all.
        if (path === "/") request.url = "/configurator.html";
        next();
      });
    },
  };
}

if (!(await stat(THEMES_ROOT).catch(() => null))) {
  console.error(
    "No themes are built yet, so the monitor would stay empty. Run `bun run --cwd site configurator:themes` first.",
  );
  process.exit(1);
}

const server = await createServer({
  configFile: false,
  root: SITE_ROOT,
  publicDir: false,
  plugins: [phosphorWoff2Only, svelte(), pretendService()],
  server: { port: PORT },
  // Named, because the scanner otherwise starts from every document in this
  // directory and walks into the status page's entry, which imports a module
  // that only exists whilst a theme is being built.
  optimizeDeps: { entries: ["configurator.html"] },
});
await server.listen();

console.log(`Configurator on http://localhost:${PORT}`);
console.log(
  `Signed in as ${SESSION.user.login}, with ${listing.repositories.length} installation${listing.repositories.length === 1 ? "" : "s"}${listing.truncated ? " and a truncated listing" : ""}.`,
);
console.log(
  "Changes to the sources arrive without a build. The themes in the monitor are the built ones; rebuild them with `bun run --cwd site configurator:themes` after changing one.",
);
