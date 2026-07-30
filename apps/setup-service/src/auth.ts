import { createHash, randomBytes } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const APP_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;

export interface PkceAuthorization {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}

export function createPkceAuthorization(
  randomToken: () => string = secureRandomToken,
): PkceAuthorization {
  const state = checkedToken(randomToken(), "OAuth state");
  const codeVerifier = checkedToken(randomToken(), "PKCE verifier");
  return {
    state,
    codeVerifier,
    codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
  };
}

export function createGitHubAuthorizationUrl(input: {
  clientId: string;
  state: string;
  codeChallenge: string;
}): string {
  checkedToken(input.state, "OAuth state");
  checkedToken(input.codeChallenge, "PKCE challenge");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.href;
}

export function createGitHubInstallationUrl(
  appSlug: string,
  state: string,
  targetId: number,
  repositoryId: number,
): string {
  if (!APP_SLUG_PATTERN.test(appSlug)) {
    throw new TypeError("GitHub App slug is invalid.");
  }
  checkedToken(state, "Installation state");
  checkedIdentifier(targetId, "GitHub installation target");
  checkedIdentifier(repositoryId, "GitHub repository");
  const url = new URL(
    `https://github.com/apps/${appSlug}/installations/new/permissions`,
  );
  url.searchParams.set("state", state);
  url.searchParams.set("suggested_target_id", String(targetId));
  url.searchParams.append("repository_ids[]", String(repositoryId));
  return url.href;
}

export function createGitHubBootstrapInstallationUrl(
  appSlug: string,
  state: string,
  targetId: number,
): string {
  if (!APP_SLUG_PATTERN.test(appSlug)) {
    throw new TypeError("GitHub App slug is invalid.");
  }
  checkedToken(state, "Installation state");
  checkedIdentifier(targetId, "GitHub installation target");
  const url = new URL(
    `https://github.com/apps/${appSlug}/installations/new/permissions`,
  );
  url.searchParams.set("state", state);
  url.searchParams.set("suggested_target_id", String(targetId));
  return url.href;
}

function secureRandomToken(): string {
  return randomBytes(32).toString("base64url");
}

function checkedToken(value: string, label: string): string {
  if (!TOKEN_PATTERN.test(value)) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value;
}

function checkedIdentifier(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} ID is invalid.`);
  }
  return value;
}
