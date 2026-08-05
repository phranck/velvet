import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { SetupStatus } from "@velvet/contracts";

export const SESSION_COOKIE_NAME = "__Host-velvet_session";

const DEFAULT_TTL_MS = 30 * 60 * 1_000;
const DEFAULT_MAX_SESSIONS = 1_000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface SetupServerSession {
  id: string;
  csrfToken: string;
  createdAt: number;
  expiresAt: number;
  oauth?: { state: string; codeVerifier: string };
  installState?: string;
  githubUserToken?: string;
  user?: { login: string; avatarUrl: string };
  installation?: {
    id: number;
    accountLogin: string;
    accountType: "User" | "Organization";
    repositorySelection: "all" | "selected";
  };
  organizationApprovalPending?: boolean;
  operation?: SetupStatus;
  provisioning?: {
    configurationHash: string;
    target?: {
      id: number;
      login: string;
      type: "User" | "Organization";
    };
    repository?: {
      id: number;
      owner: string;
      ownerId: number;
      name: string;
      htmlUrl: string;
    };
    configurationCommitted?: boolean;
    versionLockCommitted?: boolean;
    pagesEnabled?: boolean;
    workflowRunId?: number;
    workflowFailed?: boolean;
    installationUrl?: string;
    /**
     * The serial this setup claimed, kept so a retry reports the same one.
     *
     * Without it a resumed setup would take a second number and leave the first
     * recorded against an installation that also holds another.
     */
    serial?: number;
    /**
     * Whether the claimed serial reached the installation's version lock.
     *
     * The lock is written before the number is claimed, so it is written again
     * afterwards. This records that the second write succeeded, which keeps a
     * retry from repeating a commit that is already in place.
     */
    serialRecorded?: boolean;
  };
}

export interface SessionStore {
  create(): SetupServerSession;
  get(id: string): SetupServerSession | null;
  fromCookie(cookieValue: string | null): SetupServerSession | null;
  cookieValue(id: string): string;
  rotate(id: string): SetupServerSession;
  destroy(id: string): void;
}

interface SessionStoreOptions {
  secret: string;
  ttlMs?: number;
  maxSessions?: number;
  now?: () => number;
  randomToken?: () => string;
}

export function createSessionStore(options: SessionStoreOptions): SessionStore {
  if (Buffer.byteLength(options.secret, "utf8") < 32) {
    throw new TypeError("SESSION_SECRET must contain at least 32 bytes.");
  }
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) {
    throw new TypeError("Session TTL must be a positive integer.");
  }
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1) {
    throw new TypeError("Session capacity must be a positive integer.");
  }

  const sessions = new Map<string, SetupServerSession>();
  const now = options.now ?? Date.now;
  const randomToken = options.randomToken ?? secureRandomToken;

  const get = (id: string): SetupServerSession | null => {
    const session = sessions.get(id);
    if (!session) return null;
    if (session.expiresAt <= now()) {
      sessions.delete(id);
      return null;
    }
    return session;
  };

  const create = (): SetupServerSession => {
    removeExpiredSessions(sessions, now());
    while (sessions.size >= maxSessions) {
      const oldestId = sessions.keys().next().value as string | undefined;
      if (!oldestId) break;
      sessions.delete(oldestId);
    }
    const createdAt = now();
    const session: SetupServerSession = {
      id: checkedToken(randomToken()),
      csrfToken: checkedToken(randomToken()),
      createdAt,
      expiresAt: createdAt + ttlMs,
    };
    sessions.set(session.id, session);
    return session;
  };

  const cookieValue = (id: string): string => `${id}.${sign(id, options.secret)}`;

  return {
    create,
    get,
    fromCookie(value) {
      if (!value) return null;
      const [id, signature, extra] = value.split(".");
      if (extra !== undefined || !id || !signature || !TOKEN_PATTERN.test(id)) {
        return null;
      }
      const expected = sign(id, options.secret);
      if (!safeEqual(signature, expected)) return null;
      return get(id);
    },
    cookieValue,
    rotate(id) {
      const existing = get(id);
      if (!existing) throw new Error("Cannot rotate a missing session.");
      sessions.delete(id);
      const replacement = create();
      const { id: ignoredId, csrfToken: ignoredCsrf, createdAt: ignoredCreated, expiresAt: ignoredExpiry, ...data } = existing;
      void ignoredId;
      void ignoredCsrf;
      void ignoredCreated;
      void ignoredExpiry;
      Object.assign(replacement, data);
      return replacement;
    },
    destroy(id) {
      sessions.delete(id);
    },
  };
}

export function createSessionCookie(
  value: string,
  secure: boolean,
  maxAgeSeconds: number,
): string {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  return createSessionCookie("deleted", secure, 0);
}

export function parseSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const entry of cookieHeader.split(";")) {
    const [name, ...valueParts] = entry.trim().split("=");
    if (name !== SESSION_COOKIE_NAME) continue;
    const value = valueParts.join("=");
    return /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(value)
      ? value
      : null;
  }
  return null;
}

function secureRandomToken(): string {
  return randomBytes(32).toString("base64url");
}

function checkedToken(value: string): string {
  if (!TOKEN_PATTERN.test(value)) {
    throw new TypeError("Session token generator returned an invalid token.");
  }
  return value;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function removeExpiredSessions(
  sessions: Map<string, SetupServerSession>,
  now: number,
): void {
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}
