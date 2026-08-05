import { Type, type Static } from "@sinclair/typebox";

import { VelvetConfigurationSchema } from "../configuration/schemas.js";

const HttpsUrlSchema = Type.String({
  minLength: 9,
  maxLength: 2_048,
  pattern: "^https://[^\\s]+$",
});

export const SetupProgressStageSchema = Type.Union([
  Type.Literal("authenticating"),
  Type.Literal("creating-repository"),
  Type.Literal("writing-configuration"),
  Type.Literal("enabling-pages"),
  Type.Literal("starting-monitor"),
  Type.Literal("checking-services"),
  Type.Literal("publishing-data"),
  Type.Literal("building-page"),
  Type.Literal("deploying-page"),
  Type.Literal("waiting-for-deployment"),
]);

export const SetupErrorCodeSchema = Type.Union([
  Type.Literal("AUTHENTICATION_REQUIRED"),
  Type.Literal("AUTHENTICATION_FAILED"),
  Type.Literal("INSTALLATION_REQUIRED"),
  Type.Literal("ORGANIZATION_APPROVAL_REQUIRED"),
  Type.Literal("INVALID_SETUP_REQUEST"),
  Type.Literal("CSRF_REJECTED"),
  Type.Literal("ORIGIN_REJECTED"),
  Type.Literal("RATE_LIMITED"),
  Type.Literal("GITHUB_RATE_LIMITED"),
  // Distinct from REPOSITORY_CONFLICT, which means GitHub refused to create
  // the repository for a reason setup cannot name. This one is answerable: the
  // name is taken, and whoever is installing can free it or choose another.
  Type.Literal("REPOSITORY_EXISTS"),
  // The name is taken by a repository Velvet has no say over, so the offer to
  // replace it cannot be honoured. Whoever is installing deletes it themselves
  // or picks another name.
  Type.Literal("REPOSITORY_NOT_DELETABLE"),
  Type.Literal("REPOSITORY_CONFLICT"),
  Type.Literal("GITHUB_API_FAILED"),
  Type.Literal("CONFIGURATION_COMMIT_FAILED"),
  Type.Literal("PAGES_ENABLE_FAILED"),
  Type.Literal("WORKFLOW_DISPATCH_FAILED"),
  Type.Literal("WORKFLOW_FAILED"),
  Type.Literal("SETUP_PARTIAL"),
  Type.Literal("SETUP_FAILED"),
  Type.Literal("NOT_FOUND"),
  Type.Literal("METHOD_NOT_ALLOWED"),
]);

export const SetupPublicErrorSchema = Type.Object(
  {
    code: SetupErrorCodeSchema,
    message: Type.String({ minLength: 1, maxLength: 256 }),
    errorId: Type.String({
      minLength: 16,
      maxLength: 64,
      pattern: "^[A-Za-z0-9_-]+$",
    }),
  },
  { additionalProperties: false },
);

/**
 * Whether the repository setup creates is visible to everybody.
 *
 * Not part of `velvet.yml`, because Velvet neither reads nor maintains it. It
 * is decided once, when GitHub creates the repository, and belongs to GitHub
 * from then on.
 */
export const RepositoryVisibilitySchema = Type.Union(
  [Type.Literal("public"), Type.Literal("private")],
  { description: "Whether the created status repository is public or private." },
);

export const SetupRequestSchema = Type.Object(
  {
    configuration: VelvetConfigurationSchema,
    // Optional so a caller that predates the choice still validates, and
    // public when absent, because that is what every installation made before
    // this existed received.
    repositoryVisibility: Type.Optional(RepositoryVisibilitySchema),
    /*
     * Whether setup may delete a repository already using the name.
     *
     * Absent means no, and setup stops with REPOSITORY_EXISTS instead. The
     * destructive reading is never the default and never inferred: it is a
     * second request that says so, sent only after somebody has been told what
     * they would lose.
     */
    replaceExistingRepository: Type.Optional(Type.Boolean()),
    /*
     * A logo to show in the status page's header.
     *
     * The file travels with the request rather than as a URL, because a URL
     * would put somebody's status page at the mercy of whatever host it names.
     * It is written into their own repository, where it is theirs, and served
     * from their own page.
     *
     * The base64 length is capped rather than the decoded size, since that is
     * what a boundary can check before decoding anything. Three quarters of it
     * is the real limit, so roughly 384 kB of image.
     */
    logo: Type.Optional(
      Type.Object(
        {
          /** What the file is, which decides the name it is written under. */
          type: Type.Union([
            Type.Literal("image/svg+xml"),
            Type.Literal("image/png"),
            Type.Literal("image/webp"),
            Type.Literal("image/jpeg"),
          ]),
          /** The file itself, base64 without a data-URL prefix. */
          content: Type.String({ minLength: 1, maxLength: 512_000 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const SetupSessionSchema = Type.Object(
  {
    authenticated: Type.Boolean(),
    csrfToken: Type.Optional(
      Type.String({
        minLength: 43,
        maxLength: 128,
        pattern: "^[A-Za-z0-9_-]+$",
      }),
    ),
    user: Type.Optional(
      Type.Object(
        { login: Type.String({ minLength: 1, maxLength: 39 }), avatarUrl: HttpsUrlSchema },
        { additionalProperties: false },
      ),
    ),
    installation: Type.Optional(
      Type.Object(
        {
          id: Type.Integer({ minimum: 1 }),
          accountLogin: Type.String({ minLength: 1, maxLength: 100 }),
          accountType: Type.Union([Type.Literal("User"), Type.Literal("Organization")]),
          repositorySelection: Type.Union([
            Type.Literal("all"),
            Type.Literal("selected"),
          ]),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

const SetupProgressEventSchema = Type.Object(
  { type: Type.Literal("progress"), stage: SetupProgressStageSchema },
  { additionalProperties: false },
);

const SetupPermissionEventSchema = Type.Object(
  {
    type: Type.Literal("permission-required"),
    access: Type.Union([
      Type.Literal("temporary-account"),
      Type.Literal("repository"),
    ]),
    error: SetupPublicErrorSchema,
    installationUrl: HttpsUrlSchema,
  },
  { additionalProperties: false },
);

const SetupSuccessEventSchema = Type.Object(
  {
    type: Type.Literal("success"),
    installationUrl: HttpsUrlSchema,
    repositoryUrl: HttpsUrlSchema,
    workflowRunId: Type.Optional(Type.Integer({ minimum: 1 })),
    /**
     * The serial this installation received.
     *
     * Optional, because an instance with no registry configured still completes
     * setups. A missing number means none was issued, never that one was lost.
     */
    serial: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

const SetupErrorEventSchema = Type.Object(
  {
    type: Type.Literal("error"),
    error: SetupPublicErrorSchema,
    recoverable: Type.Boolean(),
    repositoryUrl: Type.Optional(HttpsUrlSchema),
    workflowRunId: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

export const SetupEventSchema = Type.Union([
  SetupProgressEventSchema,
  SetupPermissionEventSchema,
  SetupSuccessEventSchema,
  SetupErrorEventSchema,
]);

export const SetupStatusSchema = Type.Object(
  {
    operationId: Type.String({
      minLength: 16,
      maxLength: 64,
      pattern: "^[A-Za-z0-9_-]+$",
    }),
    state: Type.Union([
      Type.Literal("running"),
      Type.Literal("permission-required"),
      Type.Literal("failed"),
      Type.Literal("succeeded"),
    ]),
    stage: Type.Optional(SetupProgressStageSchema),
    installationUrl: Type.Optional(HttpsUrlSchema),
    repositoryUrl: Type.Optional(HttpsUrlSchema),
    workflowRunId: Type.Optional(Type.Integer({ minimum: 1 })),
    error: Type.Optional(SetupPublicErrorSchema),
    recoverable: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export type SetupErrorCode = Static<typeof SetupErrorCodeSchema>;
export type SetupEvent = Static<typeof SetupEventSchema>;
export type SetupProgressStage = Static<typeof SetupProgressStageSchema>;
export type SetupPublicError = Static<typeof SetupPublicErrorSchema>;
export type SetupSession = Static<typeof SetupSessionSchema>;
export type SetupStatus = Static<typeof SetupStatusSchema>;
