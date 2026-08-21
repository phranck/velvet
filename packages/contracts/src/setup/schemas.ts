import { Type, type Static } from "@sinclair/typebox";

import { VelvetConfigurationSchema } from "../configuration/schemas.js";
import { SEMANTIC_VERSION_PATTERN } from "../updates/schemas.js";
import { MAX_MANAGEABLE_INSTALLATIONS } from "./limits.js";

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
  // The alarm relay refuses for six separate reasons, and they are six codes
  // rather than one because a monitor run reports what it was told. A single
  // code would leave an operator unable to tell a misconfigured subscription
  // from a quota Velvet has run out of, and only one of those is theirs to fix.
  //
  // The instance serves no relay at all, so nothing is wrong with the call.
  Type.Literal("NOTIFY_UNAVAILABLE"),
  // The proof of which repository is calling did not verify against GitHub.
  Type.Literal("NOTIFY_IDENTITY_REJECTED"),
  // The subscription Velvet issued did not verify against Velvet's own key.
  Type.Literal("NOTIFY_GRANT_REJECTED"),
  // Both verified and they name different repositories, which is the case that
  // would otherwise let one installation alarm another operator.
  Type.Literal("NOTIFY_GRANT_MISMATCHED"),
  // This installation has spent what it may send today.
  Type.Literal("NOTIFY_ALLOWANCE_SPENT"),
  // What Pushover has left for the whole application is below the floor, so
  // sending would spend the room every other installation still needs.
  Type.Literal("NOTIFY_QUOTA_EXHAUSTED"),
  // Pushover refused the message or could not be reached.
  Type.Literal("NOTIFY_DELIVERY_FAILED"),
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

/**
 * What a monitor run sends when it asks Velvet to raise an alarm.
 *
 * Every field is bounded, because all three reach something outside this
 * service: the grant reaches a signature check, and the title and the message
 * reach Pushover, which states its own limits.
 *
 * The recipient is not in here. A monitor never sends a bare Pushover key,
 * because a relay accepting one would let any installation alarm any operator.
 * It sends the grant Velvet issued, which carries the key bound to the one
 * repository it belongs to.
 */
export const NotifyRequestSchema = Type.Object(
  {
    /** The subscription Velvet signed, as `payload.signature`. */
    grant: Type.String({
      minLength: 16,
      maxLength: 1_024,
      pattern: "^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$",
    }),
    /** The alarm text, which passes through and is never stored. */
    message: Type.String({ minLength: 1, maxLength: 1_024 }),
    /** Pushover documents a title of up to 250 characters. */
    title: Type.Optional(Type.String({ minLength: 1, maxLength: 250 })),
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
        {
          login: Type.String({ minLength: 1, maxLength: 39 }),
          avatarUrl: HttpsUrlSchema,
          /*
           * What the account calls itself on GitHub, which is optional there
           * and therefore optional here. Absent whenever the account has set
           * no name, so anything showing it needs the login to fall back on.
           */
          name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
          /*
           * The address GitHub answers with for the signed-in account. Still
           * optional, because an account can have none that GitHub will give
           * out, and anything showing it leaves the line out rather than
           * showing a gap.
           *
           * Bounded and required to hold one `@` between two runs without
           * spaces. Enough to refuse what is plainly not an address, and loose
           * enough not to refuse an unusual one that is.
           */
          email: Type.Optional(
            Type.String({
              minLength: 3,
              maxLength: 320,
              pattern: "^[^@\\s]+@[^@\\s]+$",
            }),
          ),
        },
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

/**
 * One repository the signed-in user may manage Velvet in.
 *
 * The identifiers travel together because every later request names both. An
 * installation grants access and a repository is what it grants access to, so
 * neither one on its own addresses anything.
 */
const ManageableInstallationSchema = Type.Object(
  {
    installationId: Type.Integer({ minimum: 1 }),
    repositoryId: Type.Integer({ minimum: 1 }),
    /** GitHub's own bound on an account name. */
    owner: Type.String({ minLength: 1, maxLength: 39 }),
    /** GitHub's own bound on a repository name. */
    name: Type.String({ minLength: 1, maxLength: 100 }),
    htmlUrl: HttpsUrlSchema,
    /**
     * The Velvet release recorded in the repository's `velvet.lock.json`.
     *
     * Null where no readable lock is there, which is how a repository the
     * user granted access to but never set Velvet up in is told apart from
     * one that carries an installation.
     */
    installedVersion: Type.Union([
      Type.String({
        minLength: 5,
        maxLength: 128,
        pattern: SEMANTIC_VERSION_PATTERN,
      }),
      Type.Null(),
    ]),
  },
  { additionalProperties: false },
);

/**
 * What the signed-in user may manage, as the configurator opens.
 *
 * This answers the first question the configurator has: whether there is
 * anything to configure at all. An empty list sends somebody to setup instead,
 * and a list of several is what the choice in the sidebar is made from.
 */
export const SetupInstallationsSchema = Type.Object(
  {
    repositories: Type.Array(ManageableInstallationSchema, {
      maxItems: MAX_MANAGEABLE_INSTALLATIONS,
    }),
    /**
     * Whether the search stopped at its own limit with more left to find.
     *
     * True means the list is a prefix rather than the whole answer, and
     * whoever shows it has to say so, because an installation missing from it
     * looks exactly like one that does not exist.
     */
    truncated: Type.Boolean(),
  },
  { additionalProperties: false },
);

/**
 * How one installation is published today, as the configurator opens it.
 *
 * The theme it is published in and whatever has been set on that theme, which
 * is what decides where the configurator starts from. Read out of the
 * operator's own `velvet.yml`, so it is what is live rather than what is being
 * drafted.
 *
 * The settings are passed through as they stand rather than checked here.
 * Which keys a theme offers, and what each may be set to, is in that theme's
 * own `velvet-theme.toml`, and this contract does not know which theme was
 * named until it reads it.
 */
export const InstallationConfigurationSchema = Type.Object(
  {
    /**
     * The theme the page is published in, or null where nothing was readable.
     *
     * Null is not a failure. A repository the user granted access to but never
     * set Velvet up in carries no configuration to read, and the configurator
     * then starts from the first theme on offer rather than from an error.
     */
    theme: Type.Union([
      Type.String({
        minLength: 1,
        maxLength: 64,
        pattern: "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$",
      }),
      Type.Null(),
    ]),
    themeSettings: Type.Record(
      Type.String({ pattern: "^[a-z][a-zA-Z0-9]*$" }),
      Type.Union([
        Type.String({ maxLength: 128 }),
        Type.Number(),
        Type.Boolean(),
      ]),
    ),
    /**
     * Whether the page shows the response-time chart under each service.
     *
     * A page setting rather than a theme one, so it survives a change of theme
     * and needs no theme to declare it.
     */
    responseChart: Type.Boolean(),
    /** The window the page opens in before a visitor picks one themselves. */
    defaultRange: Type.Union([
      Type.Literal("30d"),
      Type.Literal("90d"),
      Type.Literal("all"),
    ]),
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

export type NotifyRequest = Static<typeof NotifyRequestSchema>;
export type SetupErrorCode = Static<typeof SetupErrorCodeSchema>;
export type SetupEvent = Static<typeof SetupEventSchema>;
export type SetupInstallations = Static<typeof SetupInstallationsSchema>;
export type ManageableInstallation = Static<typeof ManageableInstallationSchema>;
export type InstallationConfiguration = Static<
  typeof InstallationConfigurationSchema
>;
export type SetupProgressStage = Static<typeof SetupProgressStageSchema>;
export type SetupPublicError = Static<typeof SetupPublicErrorSchema>;
export type SetupSession = Static<typeof SetupSessionSchema>;
export type SetupStatus = Static<typeof SetupStatusSchema>;
