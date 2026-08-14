<script lang="ts">
  import { MAX_SETUP_LOGO_BYTES } from "@velvet/contracts";
  import { onMount, tick } from "svelte";
  import ConsentCheckbox from "../components/ConsentCheckbox.svelte";
  import SiteHeader from "../components/SiteHeader.svelte";
  import * as RequiredField from "../components/required-field";
  import * as PageFooter from "../components/page-footer";
  import * as ReviewList from "../components/review-list";
  import * as ServiceEditor from "../components/service-editor";
  import * as StepCard from "../components/step-card";
  import {
    STEP_CARD_CONTENT_INSET,
    STEP_CARD_INNER_RADIUS,
    STEP_CARD_RADIUS,
  } from "../components/step-card/geometry.js";
  import * as ThemeCard from "../components/theme-card";
  import {
    createViewTransitionController,
    type ViewTransitionController,
  } from "../lib/view-transition.js";
  import { createBrowserSetupClient } from "./client.js";
  import fontLicensesUrl from "./FONT-LICENSES.txt?url";
  import {
    clearOnboardingDraft,
    loadOnboardingDraft,
    persistOnboardingDraft,
  } from "./onboarding-session.js";
  import {
    createOnboardingDraft,
    createServiceDraft,
    submitOnboarding,
    validateBasicsStep,
    validateServicesStep,
    type SetupProgressStage,
  } from "./state.js";
  import SquircleStep from "./SquircleStep.svelte";
  import { OFFERED_THEMES, themeById } from "../lib/themes/catalogue.js";
  import { pictureFor } from "../lib/themes/pictures.js";

  const STEPS = ["Basics", "Services", "Theme", "Review", "Publish"] as const;
  /** Publishing is its own step, and the last one. */
  const INSTALL_STEP = STEPS.length - 1;
  const REVIEW_STEP = INSTALL_STEP - 1;
  const SESSION_STORAGE = browserSessionStorage();
  const GITHUB_RETURN = githubReturnState();
  const PROGRESS_LABELS: Record<SetupProgressStage, string> = {
    authenticating: "Connecting your GitHub account",
    "creating-repository": "Creating the status repository",
    "writing-configuration": "Writing the validated configuration",
    "enabling-pages": "Enabling GitHub Pages",
    "starting-monitor": "Starting the first check",
    "checking-services": "Checking your services",
    "publishing-data": "Publishing the first status data",
    "building-page": "Building your status page",
    "deploying-page": "Publishing your status page",
    "waiting-for-deployment": "Waiting for the status page",
  };
  /**
   * The stages in the order they occur, read from the labels above so the
   * order and the wording stay a single list.
   */
  const PROGRESS_ORDER = Object.keys(PROGRESS_LABELS) as SetupProgressStage[];

  const RESTORED_DRAFT = loadOnboardingDraft(SESSION_STORAGE);
  /*
   * Coming back from GitHub resumes at the last step, but only where there is
   * a draft to publish. Without one the visitor never filled the four steps
   * before it, and landing there showed them a complaint about entries they
   * had never made.
   */
  let step = $state(GITHUB_RETURN && RESTORED_DRAFT ? INSTALL_STEP : 0);
  let draft = $state(RESTORED_DRAFT ?? createOnboardingDraft());
  let errors = $state<Record<string, string>>({});
  /**
   * The chosen logo, as something the browser can show.
   *
   * Held apart from the draft so it is never written to session storage: a
   * restored draft would otherwise carry a file somebody picked an hour ago
   * and can no longer see.
   */
  let logoPreview = $state<string | null>(null);
  /** The chosen file's name, shown beside the button that chose it. */
  let logoName = $state<string | null>(null);
  let submitting = $state(false);
  let progress = $state<SetupProgressStage[]>([]);
  let resultMessage = $state("");
  let installationUrl = $state("");
  let repositoryUrl = $state("");
  let workflowUrl = $state("");
  let setupErrorId = $state("");
  let retryAvailable = $state(false);
  /**
   * The repository setup refused to overwrite, or empty when there is none.
   *
   * Holding the name rather than a flag lets the question name what it is
   * about, which is the difference between agreeing to something and agreeing
   * to anything.
   */
  let existingRepository = $state("");
  /**
   * Whether Velvet could delete that repository if it were asked to.
   *
   * False where Velvet does not manage it, which is every repository somebody
   * made themselves. The question then has only one honest answer to offer, so
   * it stops offering the other one.
   */
  let existingRepositoryDeletable = $state(true);
  let existingRepositoryDialog = $state<HTMLDialogElement | null>(null);
  let submissionState = $state<"idle" | "permission-required" | "failed" | "success">("idle");
  let stepTransitionController: ViewTransitionController | null = null;
  /**
   * The serial this visitor would receive, or `null` before it is known.
   *
   * Provisional: nothing is reserved, so two people setting up at the same
   * moment are shown the same number and one of them ends up with the next.
   * Once a setup succeeds the server reports the number actually issued, and
   * that replaces this.
   */
  let serial = $state<number | null>(null);
  /**
   * The GitHub account this browser is connected as, or null when it is not.
   *
   * Held so the way out can name what somebody is leaving. A button saying
   * only "sign out" leaves them guessing which of their accounts it means.
   */
  let connectedAccount = $state<string | null>(null);

  /**
   * The most a logo may weigh, in bytes of the file itself.
   *
   * Taken from the contract both ends read, where it is derived from the
   * largest request the service accepts. Stating it here instead would state it
   * twice, and the two would only be found to disagree by somebody watching
   * setup fail on a file this field had just accepted.
   */
  const MAX_LOGO_BYTES = MAX_SETUP_LOGO_BYTES;

  /** What the header can show, and what the page build knows to copy. */
  const LOGO_TYPES = ["image/svg+xml", "image/png", "image/webp", "image/jpeg"];

  /**
   * Reads the chosen file into the draft, or says why it cannot be used.
   *
   * The file travels with the setup request rather than as a URL, so it is
   * read here and carried as base64. Anything the service would refuse is
   * refused here instead, where the person choosing it is still looking at the
   * field.
   */
  async function chooseLogo(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    delete errors.logo;
    if (!file) {
      delete draft.logo;
      logoPreview = null;
      logoName = null;
      return;
    }
    if (!LOGO_TYPES.includes(file.type)) {
      errors = { ...errors, logo: "Choose an SVG, PNG, WebP, or JPEG file." };
      input.value = "";
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      errors = {
        ...errors,
        logo: `That file is ${Math.round(file.size / 1_000)} kB. The most a logo may weigh is ${Math.round(MAX_LOGO_BYTES / 1_000)} kB.`,
      };
      input.value = "";
      return;
    }
    const buffer = await file.arrayBuffer();
    let binary = "";
    for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
    draft.logo = {
      type: file.type as NonNullable<typeof draft.logo>["type"],
      content: btoa(binary),
    };
    logoPreview = `data:${file.type};base64,${draft.logo.content}`;
    logoName = file.name;
  }

  /**
   * How far setup has got, as an index into `PROGRESS_ORDER`, or `-1` before
   * anything is reported.
   *
   * Completion is ordinal rather than a test for a stage's own event, because
   * a stage the server has already finished is never announced again. Setup
   * submits three times across the two GitHub approvals, `progress` is cleared
   * on each submit, and the final pass skips `creating-repository` since the
   * repository exists by then. Treating everything up to the furthest stage as
   * done keeps the list honest through that, and through any stage the server
   * skips for its own reasons.
   */
  const reachedIndex = $derived(
    progress.reduce(
      (furthest, stage) => Math.max(furthest, PROGRESS_ORDER.indexOf(stage)),
      -1,
    ),
  );
  /**
   * What each stage is working on, where naming it tells somebody something.
   *
   * Only the repository step, because that is the one where a name and an
   * account were entered several steps earlier and seeing them again confirms
   * what is about to be created.
   */
  const progressDetail = $derived<Partial<Record<SetupProgressStage, string>>>({
    "creating-repository": `${draft.repositoryOwner.trim()}/${draft.repositoryName.trim()}`,
  });
  const selectedDesign = $derived(themeById(draft.themeId));
  const previousStepLabel = $derived(step > 0 ? STEPS[step - 1] : "");
  const nextStepLabel = $derived(
    step < STEPS.length - 1 ? STEPS[step + 1] : "",
  );
  /** Padded to five digits, the way a board prints a unit number. */
  const serialLabel = $derived(
    serial === null ? "" : String(serial).padStart(5, "0"),
  );
  const customDomain = $derived(draft.customDomain.trim().toLowerCase());
  const pagesDnsTarget = $derived(
    `${draft.repositoryOwner.trim() || "your-github-name"}.github.io`,
  );

  $effect(() => {
    persistOnboardingDraft($state.snapshot(draft), SESSION_STORAGE);
  });

  /**
   * Opens the conflict question modally, which is what moves the focus into it
   * and makes Escape mean something. `showModal` throws on a dialog that is
   * already open, so the current state is checked rather than assumed.
   */
  $effect(() => {
    if (!existingRepositoryDialog) return;
    if (existingRepository) {
      if (!existingRepositoryDialog.open) existingRepositoryDialog.showModal();
    } else if (existingRepositoryDialog.open) {
      existingRepositoryDialog.close();
    }
  });

  onMount(() => {
    const contentInsetProperty = "--step-card-content-inset";
    const previousContentInset = document.documentElement.style.getPropertyValue(
      contentInsetProperty,
    );
    document.documentElement.style.setProperty(
      contentInsetProperty,
      `${STEP_CARD_CONTENT_INSET}px`,
    );
    stepTransitionController = createViewTransitionController(document);
    void readNextSerial().then((next) => {
      if (next !== null) serial = next;
    });
    if (GITHUB_RETURN) {
      clearGitHubReturnParameter();
      if (GITHUB_RETURN === "approval-required") {
        submissionState = "permission-required";
        resultMessage = "A GitHub organization owner still needs to approve Velvet.";
      } else {
        void publish();
      }
    }
    return () => {
      stepTransitionController?.destroy();
      stepTransitionController = null;
      if (previousContentInset) {
        document.documentElement.style.setProperty(
          contentInsetProperty,
          previousContentInset,
        );
      } else {
        document.documentElement.style.removeProperty(contentInsetProperty);
      }
      delete document.documentElement.dataset.onboardingDirection;
    };
  });

  /**
   * Asks the service which number comes next.
   *
   * Every failure is swallowed. The number is decoration on a backdrop, so an
   * unreachable endpoint, an instance with no registry, or a malformed answer
   * all mean the same thing here: show nothing.
   */
  async function readNextSerial(): Promise<number | null> {
    try {
      const response = await fetch("/api/serial", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { next?: unknown };
      return typeof body.next === "number" && Number.isSafeInteger(body.next)
        ? body.next
        : null;
    } catch {
      return null;
    }
  }

  /**
   * The GitHub account this browser is connected as, or null when it is not.
   *
   * Every failure is swallowed. The account is shown so somebody can leave it,
   * and a page that cannot say which one simply offers nothing.
   */
  async function readConnectedAccount(): Promise<string | null> {
    try {
      const response = await fetch("/api/session", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;
      const body = (await response.json()) as {
        authenticated?: unknown;
        user?: { login?: unknown };
      };
      return body.authenticated === true && typeof body.user?.login === "string"
        ? body.user.login
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Signs out of GitHub and starts the page over.
   *
   * The session carries the state of a setup that has begun, so leaving it is
   * the way past a setup that cannot be continued. The draft in this browser
   * is kept: the entries are still worth having on the next attempt.
   */
  async function signOut(): Promise<void> {
    try {
      const session = await fetch("/api/session", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const body = session.ok
        ? ((await session.json()) as { csrfToken?: unknown })
        : {};
      if (typeof body.csrfToken !== "string") return;
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
        headers: { "X-Velvet-CSRF": body.csrfToken },
      });
    } catch {
      // Reloading is worth doing either way: a session the service has already
      // forgotten leaves this page holding a state that no longer exists.
    }
    globalThis.location.assign("/onboarding/");
  }

  function browserSessionStorage(): Storage | null {
    try {
      return globalThis.sessionStorage ?? null;
    } catch {
      return null;
    }
  }

  function githubReturnState(): "connected" | "installed" | "approval-required" | null {
    try {
      const value = new URL(globalThis.location.href).searchParams.get("github");
      return value === "connected" ||
        value === "installed" ||
        value === "approval-required"
        ? value
        : null;
    } catch {
      return null;
    }
  }

  function clearGitHubReturnParameter(): void {
    const url = new URL(globalThis.location.href);
    url.searchParams.delete("github");
    globalThis.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  /**
   * Adds a service and puts the visitor in it.
   *
   * A new service appears below everything already entered, which on a full
   * step is off the bottom of the window. Bringing it into view and focusing
   * its first field means adding one costs a click rather than a click, a
   * scroll, and a second click.
   */
  async function addService(): Promise<void> {
    draft.services.push(createServiceDraft());
    await tick();
    const items = document.querySelectorAll("[data-service-editor-item]");
    const added = items[items.length - 1];
    added?.scrollIntoView({ behavior: scrollBehaviour(), block: "start" });
    focusFirstField(added ?? undefined);
  }

  /** Whether motion is welcome, asked of the browser rather than assumed. */
  function scrollBehaviour(): "auto" | "smooth" {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
  }

  /**
   * Focuses the first field somebody would type in, within `scope`.
   *
   * Scrolling is left to the caller, which either has just moved the page
   * itself or does not want it moved at all, so focusing must not move it a
   * second time.
   *
   * @param scope - Where to look, defaulting to the step on screen.
   */
  function focusFirstField(scope?: Element): void {
    const root =
      scope ?? document.querySelector("[data-step-card-body]:not([hidden])");
    const field = root?.querySelector<HTMLElement>(
      "input:not([type='checkbox']):not([type='radio']):not([type='file']), textarea",
    );
    field?.focus({ preventScroll: true });
  }

  function removeService(index: number): void {
    if (draft.services.length === 1) return;
    draft.services.splice(index, 1);
  }

  function changeStep(nextStep: number): void {
    if (nextStep === step) return;
    const direction = nextStep > step ? "forward" : "backward";
    const reducedMotion =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    document.documentElement.dataset.onboardingDirection = direction;
    stepTransitionController?.update(async () => {
      step = nextStep;
      await tick();
      // Inside the update, where the new step is already in the document. A
      // step with nothing to type in leaves the focus where it was.
      focusFirstField();
    }, reducedMotion);
  }

  function nextStep(): void {
    const currentErrors =
      step === 0
        ? validateBasicsStep(draft)
        : step === 1
          ? validateServicesStep(draft)
          : {};
    errors = currentErrors;
    if (Object.keys(currentErrors).length === 0) {
      changeStep(Math.min(step + 1, STEPS.length - 1));
    }
  }

  function previousStep(): void {
    errors = {};
    changeStep(Math.max(0, step - 1));
  }

  /**
   * Runs the installation and turns its outcome into what the last step shows.
   *
   * @param replaceExistingRepository - Passed only after somebody has been
   *   shown the repository that is in the way and has agreed to it being
   *   deleted. It is never remembered between attempts, so a second run that
   *   meets the same name asks again.
   */
  async function publish(replaceExistingRepository = false): Promise<void> {
    if (step !== INSTALL_STEP) changeStep(INSTALL_STEP);
    submitting = true;
    progress = [];
    resultMessage = "";
    installationUrl = "";
    repositoryUrl = "";
    workflowUrl = "";
    setupErrorId = "";
    retryAvailable = false;
    existingRepository = "";
    submissionState = "idle";
    const result = await submitOnboarding(
      draft,
      createBrowserSetupClient(),
      (stage) => {
        if (!progress.includes(stage)) progress = [...progress, stage];
      },
      replaceExistingRepository ? { replaceExistingRepository: true } : {},
    );
    submitting = false;
    if (result.state === "invalid") {
      errors = result.errors;
      resultMessage = "Check the highlighted entries and try again.";
      return;
    }
    if (result.state === "success") {
      if (typeof result.serial === "number") serial = result.serial;
      submissionState = "success";
      clearOnboardingDraft(SESSION_STORAGE);
      installationUrl = result.installationUrl;
      resultMessage = customDomain
        ? "Velvet is published. Your custom domain will work after its DNS records have propagated."
        : "Your Velvet status page is ready.";
      return;
    }
    if (result.state === "permission-required") {
      submissionState = result.state;
      resultMessage = result.message;
      return;
    }
    if (
      result.code === "REPOSITORY_EXISTS" ||
      result.code === "REPOSITORY_NOT_DELETABLE"
    ) {
      // Asked as a question rather than reported as a failure, because the
      // name being taken is something the person installing can settle, and
      // every way out is one click away.
      existingRepositoryDeletable = result.code === "REPOSITORY_EXISTS";
      existingRepository = `${draft.repositoryOwner.trim()}/${draft.repositoryName.trim()}`;
      return;
    }
    submissionState = "failed";
    resultMessage = result.message;
    repositoryUrl = result.repositoryUrl ?? "";
    workflowUrl = result.workflowUrl ?? "";
    setupErrorId = result.errorId;
    retryAvailable = result.recoverable;
    // Asked for only now, because the way out of a session is offered only
    // here and a page that succeeds never needs to name the account.
    connectedAccount = await readConnectedAccount();
  }

  /**
   * Takes back the request to publish and sends the visitor to the name field.
   *
   * The name is the only thing worth changing after this answer, so the step
   * that holds it is opened and the field is focused rather than merely shown.
   */
  async function chooseAnotherName(): Promise<void> {
    existingRepository = "";
    changeStep(0);
    await tick();
    document.getElementById("repository-name")?.focus();
  }
</script>

<svelte:head>
  <meta name="color-scheme" content="dark" />
  <link rel="license" href={fontLicensesUrl} />
</svelte:head>

<div
  class="onboarding-shell"
  style={`--step-card-radius: ${STEP_CARD_RADIUS}px; --step-card-inner-radius: ${STEP_CARD_INNER_RADIUS}px`}
>
  <!--
    The site's own bar, without the four pages it offers there. This is a
    sequence of five steps, and a bar that offers a way out of one leads
    somebody out of it, whilst the mark, the version and the scale are what make
    this the same product as the page they arrived from.
  -->
  <SiteHeader navigation={false} />

  <main>
    <section class="intro">
      <p>
        Tell Velvet what to watch, choose a theme, and publish through your
        GitHub account.
      </p>
    </section>

    <nav aria-label="Setup progress">
      <ol class="steps" style={`--step-count: ${STEPS.length}`}>
        {#each STEPS as label, index (label)}
          <li>
            <SquircleStep
              number={index + 1}
              {label}
              active={index === step}
              complete={index < step}
              disabled={index > step || submitting || (index === INSTALL_STEP && step < INSTALL_STEP)}
              onSelect={() => changeStep(index)}
            />
            {#if index < STEPS.length - 1}
              <span class="step-connector" data-step-connector aria-hidden="true"></span>
            {/if}
          </li>
        {/each}
      </ol>
    </nav>

    <form onsubmit={(event) => { event.preventDefault(); void publish(); }} novalidate>
      <StepCard.Root>
      <div class="step-card-viewport" data-step-card-viewport>
      <StepCard.Body active={step === 0} labelledBy="identity-title">
        <div class="velvet-section-heading">
          <div class="velvet-section-title">
            <span>01</span>
            <span class="separator" data-step-title-separator aria-hidden="true">//</span>
            <h2 id="identity-title">Name your status page</h2>
          </div>
          <p>Choose the GitHub account, repository, public name, and optional domain for your status page.</p>
        </div>
        <div class="form-grid two-columns">
          <label>
            <span>Your GitHub name<RequiredField.Mark /></span>
            <input
              required
              autocomplete="username"
              bind:value={draft.repositoryOwner}
              aria-describedby="repository-owner-help"
              aria-invalid={errors.repositoryOwner ? "true" : undefined}
            />
            <small id="repository-owner-help" class="field-hint">
              Enter the GitHub username or organization that should own the repository.
            </small>
            {#if errors.repositoryOwner}<small class="field-error">{errors.repositoryOwner}</small>{/if}
          </label>
          <label>
            <span>Repository name<RequiredField.Mark /></span>
            <input
              required
              autocomplete="off"
              id="repository-name"
              bind:value={draft.repositoryName}
              aria-describedby="repository-name-help"
              aria-invalid={errors.repositoryName ? "true" : undefined}
            />
            <small id="repository-name-help" class="field-hint">
              Velvet creates this repository for your status page. For example: status.
            </small>
            {#if errors.repositoryName}<small class="field-error">{errors.repositoryName}</small>{/if}
          </label>
          <label>
            <span>Status page name<RequiredField.Mark /></span>
            <input
              required
              autocomplete="organization"
              bind:value={draft.statusPageName}
              aria-describedby="status-page-name-help"
              aria-invalid={errors.statusPageName ? "true" : undefined}
            />
            <small id="status-page-name-help" class="field-hint">
              This is the public name visitors see on your status page.
            </small>
            {#if errors.statusPageName}<small class="field-error">{errors.statusPageName}</small>{/if}
          </label>
          <label>
            <span>Custom domain (optional)</span>
            <input
              autocomplete="url"
              autocapitalize="none"
              inputmode="url"
              placeholder="status.example.com"
              spellcheck={false}
              bind:value={draft.customDomain}
              aria-describedby="custom-domain-help"
              aria-invalid={errors.customDomain ? "true" : undefined}
            />
            <small id="custom-domain-help" class="field-hint">
              Enter only the hostname, without https://, a path, port, credentials, or wildcard.
            </small>
            {#if errors.customDomain}<small class="field-error">{errors.customDomain}</small>{/if}
          </label>
          <!--
            A field rather than a label, because the control it holds is opened
            by a label of its own. The browser's own file control draws a system
            button and its own wording, which is the one thing on this page that
            does not look like the rest of it.
          -->
          <div class="field full-width">
            <span id="logo-label">Logo (optional)</span>
            <input
              id="logo-file"
              class="file-input"
              type="file"
              accept="image/svg+xml,image/png,image/webp,image/jpeg"
              onchange={chooseLogo}
              aria-labelledby="logo-label"
              aria-describedby="logo-help"
              aria-invalid={errors.logo ? "true" : undefined}
            />
            <div class="file-row">
              <label class="velvet-button velvet-button--secondary" for="logo-file">
                <i class="ph-duotone ph-upload-simple" aria-hidden="true"></i>
                <span data-step-card-button-label>Choose a file</span>
              </label>
              <span class="file-name">{logoName ?? "No file chosen"}</span>
            </div>
            <small id="logo-help" class="field-hint">
              Shown in the header of your status page instead of its name. SVG,
              PNG, WebP, or JPEG, up to 350 kB. The file is written into your own
              repository and served from your own page.
            </small>
            {#if errors.logo}<small class="field-error">{errors.logo}</small>{/if}
            {#if logoPreview}
              <img class="logo-preview" src={logoPreview} alt="The logo you chose" />
            {/if}
          </div>
          <label class="full-width">
            <span>Description (optional)</span>
            <textarea
              autocomplete="off"
              maxlength="300"
              rows="3"
              placeholder="Live status for the Velvet Underground platform."
              bind:value={draft.description}
              aria-describedby="description-help"
              aria-invalid={errors.description ? "true" : undefined}
            ></textarea>
            <small id="description-help" class="field-hint">
              One sentence about your page. Search engines and shared links show it beneath the name.
            </small>
            {#if errors.description}<small class="field-error">{errors.description}</small>{/if}
          </label>
          {#if draft.customDomain.trim()}
            <!--
              Verification comes first because it is the one step with a
              security consequence: an unverified domain can be claimed by
              another GitHub account during any gap where no repository holds
              it, which is exactly what a rebuilt installation creates. The DNS
              records below only decide whether the page answers.
            -->
            <aside
              class="domain-verification full-width"
              aria-label="Verify this domain on GitHub"
            >
              <strong>Verify this domain on GitHub</strong>
              <p>
                Do this in your GitHub account, under Settings, Pages. GitHub gives you a
                <code>TXT</code> record to add beside the records below.
              </p>
              <p>
                Until the domain is verified, another GitHub account can claim it during any gap
                where no repository holds it, and serve their own content on your address.
              </p>
            </aside>
            <aside
              class="dns-guidance full-width"
              aria-label="Required DNS change"
            >
              <strong>DNS change required</strong>
              <p>
                DNS changes happen outside Velvet and may take time to propagate. After publishing,
                update the records at your DNS provider.
              </p>
              <dl>
                <dt>For a subdomain, such as <code>status.example.com</code></dt>
                <dd>
                  One <code>CNAME</code> record pointing to <code>{pagesDnsTarget}</code>
                </dd>
                <dt>For a root domain, such as <code>example.com</code></dt>
                <dd>
                  One <code>ALIAS</code> or <code>ANAME</code> record pointing to
                  <code>{pagesDnsTarget}</code>, or, where your provider offers neither, these four
                  <code>A</code> records:
                  <ul>
                    <li><code>185.199.108.153</code></li>
                    <li><code>185.199.109.153</code></li>
                    <li><code>185.199.110.153</code></li>
                    <li><code>185.199.111.153</code></li>
                  </ul>
                </dd>
              </dl>
            </aside>
          {/if}
        </div>
        <RequiredField.Legend />
      </StepCard.Body>

      <StepCard.Body active={step === 1} labelledBy="services-title">
        <div class="velvet-section-heading">
          <div class="velvet-section-title">
            <span>02</span>
            <span class="separator" data-step-title-separator aria-hidden="true">//</span>
            <h2 id="services-title">Add services</h2>
          </div>
          <p>Add every website, API, or endpoint you want to show. A name and URL are enough; Velvet considers a final HTTP 200 response healthy.</p>
        </div>

        <ServiceEditor.List onAdd={() => void addService()}>
          {#each draft.services as service, serviceIndex (service.id)}
            <ServiceEditor.Item id={service.id}>
              <ServiceEditor.Root
                {service}
                index={serviceIndex}
                {errors}
                canRemove={draft.services.length > 1}
                onRemove={() => removeService(serviceIndex)}
                serviceNameDescription="Shown publicly on your status page. For example: Website, API, or Storage."
                urlLabel="URL to monitor"
                urlDescription="The address Velvet checks. Use a normal website URL or a dedicated health endpoint."
              />
            </ServiceEditor.Item>
          {/each}
        </ServiceEditor.List>
        <RequiredField.Legend />
      </StepCard.Body>

      <StepCard.Body active={step === 2} labelledBy="theme-title">
        <div class="velvet-section-heading">
          <div class="velvet-section-title">
            <span>03</span>
            <span class="separator" data-step-title-separator aria-hidden="true">//</span>
            <h2 id="theme-title">Choose a theme</h2>
          </div>
          <p>A theme brings its own colours, typefaces and layout with it. Your page is published in the one you choose here, and naming another theme in the configuration publishes it in that one instead.</p>
        </div>
        <ThemeCard.Root
          legend="Themes"
          description="Select one of the four themes Velvet ships. Each picture is a page published in that theme."
        >
          {#each OFFERED_THEMES as theme (theme.id)}
            <ThemeCard.Option
              name={theme.name}
              era={theme.era}
              value={theme.id}
              screenshot={pictureFor(theme)}
              selected={draft.themeId === theme.id}
              radioName="theme"
              onSelect={(value) => (draft.themeId = value)}
            />
          {/each}
        </ThemeCard.Root>
        {#if errors.themeId}<small class="field-error">{errors.themeId}</small>{/if}
      </StepCard.Body>

      <StepCard.Body active={step === 3} labelledBy="publish-title">
        <div class="velvet-section-heading">
          <div class="velvet-section-title">
            <span>04</span>
            <span class="separator" data-step-title-separator aria-hidden="true">//</span>
            <h2 id="publish-title">Review your status page</h2>
          </div>
          <p>Check everything over. Publishing creates the repository, starts monitoring, and puts the status page online with GitHub Pages.</p>
        </div>
        <ReviewList.Root>
          <ReviewList.Item
            label="Repository"
            value={`${draft.repositoryOwner}/${draft.repositoryName}`}
            icon="ph-git-branch"
          />
          <ReviewList.Item
            label="Status page"
            value={draft.statusPageName}
            icon="ph-monitor"
          />
          <ReviewList.Item
            label={draft.services.length === 1 ? "Service" : "Services"}
            value={draft.services.length}
            icon="ph-stack"
          />
          <ReviewList.Item
            label="Theme"
            value={selectedDesign?.name ?? "Choose a theme"}
            icon="ph-palette"
          />
          {#if customDomain}
            <ReviewList.Item
              label="Custom domain"
              value={customDomain}
              icon="ph-globe"
            />
          {/if}
        </ReviewList.Root>
        <div class="gallery-consent">
          <ConsentCheckbox
            checked={draft.listInGallery}
            onchange={(listed) => (draft.listInGallery = listed)}
          >
            By checking this box, you allow Velvet to display your status page
            as a reference on our
            <!-- Inside the label, so a click on it would otherwise toggle the
                 box on the way past. Opening the page and answering the
                 question are separate intentions. -->
            <a
              href="https://velvet.li/references"
              target="_blank"
              rel="noopener noreferrer"
              onclick={(event) => event.stopPropagation()}
            >references overview</a>. Only the page itself is shown, never the
            repository behind it, so a private repository makes no difference.
            You can change this setting at any time in your status page's
            <code>velvet.yml</code>.
          </ConsentCheckbox>
        </div>
        <div class="visibility-choice">
          <ConsentCheckbox
            checked={draft.privateRepository}
            onchange={(isPrivate) => (draft.privateRepository = isPrivate)}
          >
            Keep the repository private. Your status page stays public either
            way; this only hides the repository behind it, with your
            configuration and your monitoring history.
          </ConsentCheckbox>
          <!-- Marked out rather than set as fine print, because it decides
               whether the page appears at all. This is also why the box starts
               unchecked: a default of private would hand anybody on a free
               account a repository that works and a page that never
               publishes. -->
          <p class="visibility-requirement">
            A private repository needs a paid GitHub plan. GitHub publishes
            Pages from a private repository only on GitHub Pro and above, so on
            a free account leave this unchecked or your status page will not
            appear.
          </p>
        </div>
        <p class="github-permission-note">
          GitHub asks for two approvals during the first setup. The first lets Velvet create the repository and is removed immediately. The second gives Velvet access only to that new repository.
        </p>
      </StepCard.Body>

      <StepCard.Body active={step === INSTALL_STEP} labelledBy="install-title">
        <div class="velvet-section-heading">
          <div class="velvet-section-title">
            <span>05</span>
            <span class="separator" data-step-title-separator aria-hidden="true">//</span>
            <h2 id="install-title">Publish</h2>
          </div>
          <p>Velvet creates the repository, runs the first check, and publishes your status page. This takes a couple of minutes.</p>
        </div>
        {#if submitting || progress.length > 0}
          <ol
            class="deployment-progress"
            aria-label="Deployment progress"
          >
            {#each Object.entries(PROGRESS_LABELS) as [stage, label], index (stage)}
              {@const running = submitting && index === reachedIndex}
              {@const done = index < reachedIndex || (!submitting && index <= reachedIndex)}
              <li class:complete={done} class:running>
                <i
                  class={`ph-duotone ${done ? "ph-check-circle" : running ? "ph-spinner-ball" : "ph-circle"}`}
                  aria-hidden="true"
                ></i>
                <span>{label}</span>
                {#if progressDetail[stage as SetupProgressStage]}
                  <code>{progressDetail[stage as SetupProgressStage]}</code>
                {/if}
              </li>
            {/each}
          </ol>
        {/if}

        <div class="result" data-setup-state={submissionState} aria-live="polite">
          {#if resultMessage}<p>{resultMessage}</p>{/if}
          {#if repositoryUrl || workflowUrl}
            <div class="recovery-links" data-recovery-links>
              {#if repositoryUrl}<a href={repositoryUrl} target="_blank" rel="noopener noreferrer">Open repository</a>{/if}
              {#if workflowUrl}<a href={workflowUrl} target="_blank" rel="noopener noreferrer">View failed workflow</a>{/if}
            </div>
          {/if}
          {#if setupErrorId}<small>Reference: <code>{setupErrorId}</code></small>{/if}
          {#if connectedAccount && submissionState === "failed"}
            <!-- Named, because a session holds the setup it began and leaving
                 it is the way past one that cannot be continued. A button
                 saying only "sign out" leaves somebody guessing which of their
                 accounts it means. -->
            <button
              class="sign-out"
              type="button"
              data-sign-out
              onclick={() => void signOut()}
            >
              <i class="ph-duotone ph-sign-out" aria-hidden="true"></i>
              <span>Sign out of GitHub as {connectedAccount} and start over</span>
            </button>
          {/if}
        </div>
      </StepCard.Body>
      </div>

      <StepCard.Footer>
        {#if step > 0 && !submitting && step !== INSTALL_STEP}
          <button class="velvet-button velvet-button--secondary" type="button" onclick={previousStep}>
            <span data-step-card-button-label>{previousStepLabel}</span>
          </button>
        {/if}
        {#if step === INSTALL_STEP && submissionState === "failed" && !submitting}
          <!-- A failed install is usually a wrong answer earlier, so the way
               back to the review is the useful offer. -->
          <button
            class="velvet-button velvet-button--secondary"
            type="button"
            onclick={() => changeStep(REVIEW_STEP)}
            data-back-to-review
          >
            <span data-step-card-button-label>Review</span>
          </button>
        {/if}
        {#if step < REVIEW_STEP}
          <button class="velvet-button velvet-button--primary" type="button" onclick={nextStep}>
            <span data-step-card-button-label>{nextStepLabel}</span>
          </button>
        {:else if step === INSTALL_STEP && submissionState === "success" && installationUrl}
          <a class="velvet-button velvet-button--primary" href={installationUrl} data-open-status-page>
            <i class="ph-duotone ph-chart-line-up" aria-hidden="true"></i>
            <span data-step-card-button-label>Open Status Page</span>
          </a>
        {:else}
          <button class="velvet-button velvet-button--primary" type="submit" disabled={submitting}>
            <span data-step-card-button-label>
              {submitting
                ? "Setting up Velvet…"
                : submissionState === "permission-required"
                  ? "Continue with GitHub"
                  : submissionState === "failed"
                    ? retryAvailable
                      ? "Retry setup"
                      : "Try setup again"
                    : "Create status page"}
            </span>
          </button>
        {/if}
      </StepCard.Footer>
      </StepCard.Root>
    </form>
  </main>
  <PageFooter.Root>
    <PageFooter.Credit />
    <PageFooter.Serial label={serialLabel} />
  </PageFooter.Root>

  <!-- Modal on purpose. Deleting a repository is not a choice to leave open
       beside the form whilst something else is clicked. Dismissing it counts
       as declining, so the destructive answer is only ever given deliberately. -->
  <dialog
    bind:this={existingRepositoryDialog}
    class="repository-conflict"
    data-repository-conflict
    aria-labelledby="repository-conflict-title"
    onclose={() => {
      if (existingRepository) void chooseAnotherName();
    }}
  >
    <h2 id="repository-conflict-title">That repository already exists</h2>
    {#if existingRepositoryDeletable}
      <p>
        <code>{existingRepository}</code> is already on GitHub, so Velvet has not created
        anything. Choose a different name, or let Velvet delete that repository and
        create it again.
      </p>
      <p class="repository-conflict-warning">
        Deleting it removes everything in it, including its history, issues, and any
        status page published from it. This cannot be undone.
      </p>
    {:else}
      <p>
        <code>{existingRepository}</code> is already on GitHub, and Velvet does not
        manage it, so it cannot delete it for you. Delete it on GitHub yourself and
        start again, or choose a different name.
      </p>
    {/if}
    <div class="repository-conflict-actions">
      <button
        class="velvet-button velvet-button--secondary"
        type="button"
        data-choose-another-name
        onclick={chooseAnotherName}
      >
        <span data-step-card-button-label>Change the name</span>
      </button>
      {#if existingRepositoryDeletable}
        <button
          class="velvet-button velvet-button--danger"
          type="button"
          data-replace-repository
          onclick={() => {
            existingRepository = "";
            void publish(true);
          }}
        >
          <span data-step-card-button-label>Delete and create it again</span>
        </button>
      {:else}
        <a
          class="velvet-button velvet-button--primary"
          href={`https://github.com/${existingRepository}`}
          target="_blank"
          rel="noreferrer noopener"
          data-open-existing-repository
        >
          <span data-step-card-button-label>Open it on GitHub</span>
        </a>
      {/if}
    </div>
  </dialog>
</div>

<style>
  /* Shown at the size the header shows it, so the choice is judged as it will
     appear rather than as a thumbnail. */
  .logo-preview {
    display: block;
    /* Centred, because a logo is shown here to be looked at rather than read
       along the column the fields above it stand in. */
    margin: 0.5rem auto 0;
    max-height: 4.5rem;
    max-width: 100%;
    object-fit: contain;
  }
  /*
   * Kept in the page rather than hidden with `display: none`, so it can still
   * be reached by keyboard and still announce itself. The label beside it is
   * what anybody sees and clicks.
   */
  .file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    padding: 0;
    border: 0;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .file-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-inline: var(--setup-control-radius);
  }
  .file-row > label {
    flex: none;
    /* The secondary variant pushes itself away from its neighbour in a card's
       footer, which is not what it is doing here. */
    margin: 0;
  }
  .file-input:focus-visible + .file-row > label {
    outline: 2px solid var(--setup-accent);
    outline-offset: 2px;
  }
  .file-name {
    overflow: hidden;
    color: var(--setup-muted);
    font-size: var(--setup-card-copy);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .onboarding-shell {
    /* What this surface sets for itself. The rest of the setup namespace comes
       from velvet-tokens.css.

       The control height and the lead are the two the website states
       differently: a form is worked through rather than read, so both are a
       step below the site's. */
    --setup-card: var(--velvet-rule);
    --setup-input: #11131a;
    --setup-input-border: 1px solid
      color-mix(in srgb, var(--setup-text) 14%, transparent);
    --setup-error: #ff8d9a;
    --setup-success: #7fdda2;
    --setup-control-height: 2.5rem;
    --setup-control-radius: 0.55rem;
    --setup-text-lead: 1.125rem;
    --setup-text-caption: var(--velvet-text-caption);
    --setup-card-copy: var(--setup-text-copy);
    --setup-button-font-size: var(--setup-text-body);
    --consent-text: var(--setup-text);
    --consent-muted: var(--setup-muted);
    --consent-accent: var(--setup-accent);
    --consent-checked: var(--setup-success);
    --consent-font-size: var(--setup-card-copy);
    --required-mark-color: var(--setup-error);
    --required-legend-color: var(--setup-muted);
    --required-legend-size: var(--setup-text-body);
    --picker-accent: var(--setup-accent);
    --picker-description-font-size: var(--setup-card-copy);
    --picker-icon-size: 1.875rem;
    --picker-label-font-size: var(--setup-text-body);
    --picker-muted: var(--setup-muted);
    --picker-popover: var(--setup-panel-raised);
    --picker-popover-radius: var(--step-card-inner-radius);
    --picker-surface: var(--setup-card);
    --picker-text: var(--setup-text);
    --picker-text-inset: var(--setup-control-radius);
    --service-editor-accent: var(--setup-accent);
    --service-editor-card: var(--setup-card);
    --service-editor-card-radius: var(--step-card-inner-radius);
    --service-editor-card-text-inset: var(--service-editor-card-radius);
    --service-editor-button-padding-inline: 0.5rem;
    --service-editor-control-height: var(--setup-control-height);
    --service-editor-control-radius: var(--step-card-inner-radius);
    --service-editor-error: var(--setup-error);
    --service-editor-font-size: var(--setup-text-body);
    --service-editor-health-grid-columns: repeat(4, minmax(0, 1fr));
    --service-editor-input: var(--setup-input);
    --service-editor-input-border: var(--setup-input-border);
    --service-editor-muted: var(--setup-muted);
    --service-editor-raised: var(--setup-panel-raised);
    --service-editor-caption-font-size: var(--setup-text-caption);
    --service-editor-heading-font: var(--setup-heading-font);
    --service-editor-title-font-size: 1.5rem;
    --service-editor-copy-font-size: var(--setup-card-copy);
    --service-editor-small-font-size: var(--setup-text-small);
    --service-editor-text: var(--setup-text);
    --service-editor-text-inset: var(--setup-control-radius);
    --theme-card-description-font-size: var(--setup-card-copy);
    --theme-card-font-size: var(--setup-text-body);
    --theme-card-heading-font: var(--setup-heading-font);
    --theme-card-heading-font-size: 1.25rem;
    --theme-card-columns: repeat(4, minmax(0, 1fr));
    --theme-card-gap: 0.7rem;
    --theme-card-option-text-inset: 0.52rem;
    --theme-card-text-inset: 0.75rem;
    --review-card-radius: var(--step-card-inner-radius);
    min-height: 100vh;
    font-family: var(--setup-font);
    font-size: var(--setup-text-body);
  }
  /* Every button that stands in a form row. An icon option is not one: it is
     square and sized by its column, and a control height would stretch it out
     of square on a narrow screen. */
  .onboarding-shell :global(button:not([role="option"])) {
    min-height: var(--setup-control-height);
    font-size: var(--setup-button-font-size);
  }
  .onboarding-shell :global(button) {
    border: 0;
    outline: none;
  }
  /* Narrower than the bar above it, and deliberately so. The bar carries the
     page measure every Velvet surface shares, whilst this holds a form: a
     column of labelled fields read at a reading width rather than stretched to
     the width of a page. The inset is the site's, so both step back from the
     window edge by the same amount on a narrow screen. */
  main {
    width: min(100% - 2 * var(--velvet-page-inset), 960px);
    margin: 0 auto;
    padding: clamp(2.5rem, 6vw, 4.5rem) 0 7rem;
  }
  .intro {
    width: 100%;
    display: grid;
    justify-items: center;
    margin-bottom: 4.5rem;
    text-align: center;
  }
  /* The lead size rather than the intro one. This is the sentence that opens
     the surface, not a title: the intro size belonged to it whilst the mark
     stood above it and carried the page, and with the mark in the bar it was
     the largest thing on the page and read as a heading. */
  .intro > p:last-child {
    width: 100%;
    max-width: none;
    margin: 3.5rem 0 0;
    color: color-mix(in srgb, var(--setup-muted) 78%, var(--setup-text));
    font-size: var(--velvet-text-lead);
    line-height: 1.4;
  }
  .steps {
    /* Five tiles and four gaps come to 86% of the window at these rates, so the
       row fits at every width rather than needing a breakpoint to rescue it on
       a phone. Both reach their ceiling well before a desktop, where the row
       keeps the size and spacing it has always had. */
    --step-size: clamp(2.75rem, 14vw, 5.5rem);
    --step-gap: clamp(0.4rem, 4vw, 2.625rem);

    display: grid;
    /* Driven by the number of steps, so adding one does not wrap the row as it
       did when this was fixed at four. */
    grid-template-columns: repeat(var(--step-count, 4), var(--step-size));
    align-items: center;
    justify-content: center;
    gap: var(--step-gap);
    margin-bottom: 1rem;
    padding: 0;
    list-style: none;
  }
  .steps li {
    position: relative;
    width: var(--step-size);
    height: var(--step-size);
  }
  .step-connector {
    position: absolute;
    top: 50%;
    left: calc(100% + 5px);
    width: calc(var(--step-gap) - 10px);
    height: 2px;
    transform: translateY(-50%);
    border-radius: 999px;
    background: color-mix(in srgb, var(--setup-muted) 42%, transparent);
  }
  form {
    display: grid;
    gap: 0.75rem;
    overflow: visible;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
  .step-card-viewport {
    position: relative;
  }
  .step-card-viewport :global([data-step-card-body]:not([hidden])) {
    view-transition-name: onboarding-step-card;
  }
  .velvet-section-title > span {
    color: var(--setup-accent);
    font-family: var(--setup-heading-font);
    font-size: var(--velvet-text-heading);
    font-weight: 600;
    letter-spacing: 0.08em;
    line-height: 1.1;
  }
  .velvet-section-title .separator {
    color: var(--setup-accent);
    letter-spacing: 0;
  }
  h2 {
    margin: 0;
    color: var(--setup-text);
    font-family: var(--setup-heading-font);
    font-size: var(--velvet-text-heading);
    font-weight: 600;
    letter-spacing: -0.025em;
  }
  .velvet-section-heading p {
    margin: 0;
    color: var(--setup-muted);
    font-size: var(--setup-card-copy);
    line-height: 1.5;
  }
  .form-grid {
    display: grid;
    gap: 1rem;
  }
  .two-columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .full-width {
    grid-column: 1 / -1;
  }
  /* A field's own label, and the field that stands in for one where the
     control is opened by a label of its own. A label that is a button is
     neither, and laying it out as a field would stack its icon above its
     word. */
  label:not(.velvet-button),
  .field {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 0.42rem;
  }
  label:not(.velvet-button) > span,
  .field > span {
    margin-inline: var(--setup-control-radius);
    color: var(--setup-text);
    font-size: var(--setup-text-body);
    font-weight: 650;
  }
  input,
  textarea {
    width: 100%;
    height: var(--setup-control-height);
    min-width: 0;
    padding: 0 0.75rem;
    /* A single line centred in the control reads low for the same reason a
       button's word does. A textarea stacks from the top and takes its own
       padding below. */
    padding-block: 0 var(--velvet-cap-shift, 0em);
    border: var(--setup-input-border);
    border-radius: var(--setup-control-radius);
    outline: none;
    background: var(--setup-input);
    color: var(--setup-text);
    box-sizing: border-box;
    font: inherit;
  }
  /* Three lines of room, so a sentence that runs on stays readable whilst it
     is being written. Fixed at that, because the field holds one sentence and
     a box somebody has dragged taller sits oddly in a row of controls that all
     stand at the same height. */
  textarea {
    height: auto;
    padding: 0.55rem 0.75rem;
    line-height: 1.45;
    resize: none;
  }
  input::placeholder,
  textarea::placeholder {
    color: #747887;
  }
  input:focus-visible,
  textarea:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--setup-accent) 22%, transparent);
  }
  input[aria-invalid="true"],
  textarea[aria-invalid="true"] {
    background: color-mix(in srgb, var(--setup-error) 9%, var(--setup-input));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--setup-error) 70%, transparent);
  }
  input:disabled {
    opacity: 0.55;
  }
  .field-error,
  .field-hint {
    margin-inline: var(--setup-control-radius);
  }
  .field-error {
    color: var(--setup-error);
    font-size: var(--setup-text-small);
  }
  .field-hint {
    color: var(--setup-muted);
    font-size: var(--setup-text-caption);
    line-height: 1.45;
  }
  /* The two notices a custom domain brings with it, tinted the way the rest of
     the setup tints a surface: the accent for what has to be done for the page
     to answer, and the warning tone for the one step with a security
     consequence. Both share their geometry, so only the colour separates
     them. */
  .dns-guidance,
  .domain-verification {
    padding: 0.9rem 1rem;
    border-radius: var(--step-card-inner-radius);
    font-size: var(--setup-text-lead);
    line-height: 1.5;
  }
  .dns-guidance {
    background: color-mix(in srgb, var(--setup-accent) 12%, transparent);
    color: var(--setup-muted);
  }
  .domain-verification {
    background: color-mix(in srgb, var(--velvet-degraded) 12%, transparent);
    color: var(--velvet-degraded);
  }
  .dns-guidance > strong,
  .dns-guidance > p,
  .dns-guidance > dl,
  .domain-verification > strong,
  .domain-verification > p {
    margin-inline: 0.7rem;
  }
  .dns-guidance strong,
  .dns-guidance code,
  .dns-guidance dt {
    color: var(--setup-text);
  }
  .domain-verification strong,
  .domain-verification code {
    color: var(--setup-text);
  }
  .dns-guidance p,
  .domain-verification p {
    margin-top: 0.3rem;
    margin-bottom: 0;
    font-size: var(--setup-card-copy);
  }
  .dns-guidance dl {
    margin-top: 0.65rem;
    margin-bottom: 0;
    font-size: var(--setup-card-copy);
  }
  .dns-guidance dt {
    margin-top: 0.7rem;
    font-weight: 600;
  }
  .dns-guidance dt:first-child {
    margin-top: 0;
  }
  .dns-guidance dd {
    margin-left: 0;
    margin-top: 0.2rem;
  }
  .dns-guidance ul {
    display: grid;
    gap: 0.25rem;
    margin-top: 0.4rem;
    margin-bottom: 0;
    padding-left: 1.2rem;
  }
  .dns-guidance code {
    font-family: inherit;
    overflow-wrap: anywhere;
  }
  .velvet-button i {
    font-size: 1.15em;
  }
  .gallery-consent {
    margin: 1.4rem 1rem 0;
  }
  .visibility-choice {
    margin: 1.4rem 1rem 0;
  }
  /* Carries the warning colour of the Velvet Default theme on its own tinted
     surface, the way the reference marks the one thing that must not be read
     past. Somebody who ticks the box above and skims this ends up with a page
     that never publishes. */
  .visibility-requirement {
    margin: 0.6rem 0 0;
    padding: 0.7rem 0.9rem;
    border-radius: var(--step-card-inner-radius);
    background: color-mix(in srgb, var(--velvet-degraded) 12%, transparent);
    color: var(--velvet-degraded);
    font-size: var(--setup-card-copy);
    line-height: 1.5;
  }
  /* A step card that happens to be a dialog, so it takes the step card's own
     radius and inset rather than numbers of its own. */
  .repository-conflict {
    max-width: 32rem;
    /* The fallback matches STEP_CARD_CONTENT_INSET, the way StepCardBody
       states it, because a dialog is rendered before onMount publishes it. */
    padding: var(--step-card-content-inset, 16px);
    border: 0;
    border-radius: var(--step-card-radius);
    background: var(--setup-card);
    color: var(--setup-text);
  }
  .repository-conflict::backdrop {
    background: var(--velvet-scrim);
  }
  /* Half the radius, in addition to the padding, because a surface stands
     beneath both of these. */
  .repository-conflict h2,
  .repository-conflict p {
    margin-inline: calc(var(--step-card-radius) / 2);
  }
  .repository-conflict h2 {
    margin-block: 0.4rem 0.8rem;
    font-family: var(--velvet-font-heading);
    font-size: var(--velvet-text-heading);
    line-height: 1.1;
  }
  .repository-conflict p {
    margin-block: 0 0.8rem;
    font-size: var(--setup-card-copy);
    line-height: 1.55;
  }
  /* No text inset: this block has an edge of its own, so it sits at the card's
     content edge like a code block or a table would. */
  .repository-conflict-warning {
    margin-inline: 0;
    padding: 0.7rem 0.9rem;
    border-radius: var(--step-card-inner-radius);
    background: color-mix(in srgb, var(--velvet-outage) 12%, transparent);
    color: var(--velvet-outage);
  }
  .repository-conflict-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    justify-content: flex-end;
    margin-top: 1.2rem;
  }
  .repository-conflict-actions .velvet-button {
    /* Matching the card footer's buttons, which is where every other pair of
       answers on this page sits. The secondary variant gives itself an
       automatic left margin there to hold the footer's two ends apart, and
       here the two answers belong together. */
    margin-right: 0;
    padding-inline: 1.1rem;
  }
  .github-permission-note {
    margin: 1rem 1rem 0;
    color: var(--setup-muted);
    font-size: var(--setup-card-copy);
    line-height: 1.5;
  }
  .deployment-progress {
    display: grid;
    gap: 0.6rem;
    margin: 1.4rem 0 0;
    padding: 1rem;
    border-radius: var(--step-card-inner-radius);
    background: var(--setup-card);
    list-style: none;
  }
  .deployment-progress li {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    color: var(--setup-muted);
    font-size: var(--setup-text-lead);
  }
  .deployment-progress li.complete {
    color: var(--setup-text);
  }
  .deployment-progress i {
    flex: none;
    color: var(--setup-accent);
    font-size: 1.625rem;
  }
  /* The repository this step is creating, set apart from the sentence around
     it the way a name is everywhere else in the product. */
  .deployment-progress code {
    overflow: hidden;
    padding: var(--velvet-code-inset);
    border-radius: var(--velvet-code-radius);
    background: var(--velvet-code-tint);
    font-size: var(--setup-text-body);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .deployment-progress li.complete i {
    color: var(--setup-success);
  }
  .deployment-progress li.running i {
    animation: velvet-spin 900ms linear infinite;
  }
  @keyframes velvet-spin {
    to {
      transform: rotate(1turn);
    }
  }
  .result {
    min-height: 2rem;
    /* No inset of its own. It stands where the progress list above it stands,
       and once it draws a surface an inset here would sit on top of the card's
       own padding and hold it further in than everything around it. */
    margin: 1rem 0 0;
    color: var(--setup-text);
    font-size: var(--setup-card-copy);
  }
  /*
   * An outcome gets a surface of its own, in the tone the rest of the product
   * draws that outcome in. Before this all three were sentences in the same
   * grey, indistinguishable from a note.
   */
  .result[data-setup-state="failed"],
  .result[data-setup-state="permission-required"],
  .result[data-setup-state="success"] {
    padding: var(--step-card-content-inset);
    border-radius: var(--step-card-inner-radius);
    background: color-mix(in srgb, var(--result-tone) 12%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--result-tone) 40%, transparent);
  }
  .result[data-setup-state="failed"] {
    --result-tone: var(--setup-error);
  }
  /* Something to answer rather than something that went wrong, so it carries
     the accent instead of the outage tone. */
  .result[data-setup-state="permission-required"] {
    --result-tone: var(--setup-accent);
  }
  /* The green the finished steps above it are ticked in. */
  .result[data-setup-state="success"] {
    --result-tone: var(--setup-success);
  }
  .result p {
    margin: 0;
  }
  .result a {
    display: inline-block;
    margin-top: 0.5rem;
    color: var(--setup-accent);
    font-weight: 700;
  }
  .recovery-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .result small {
    display: block;
    margin-top: 0.65rem;
    color: var(--setup-muted);
    font-size: var(--setup-text-small);
  }
  .result code {
    color: var(--setup-text);
    font-family: inherit;
  }
  .sign-out {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.75rem;
    padding: 0;
    background: transparent;
    color: var(--setup-muted);
    cursor: pointer;
    font-size: var(--setup-text-small);
    font-weight: 650;
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  .sign-out:hover {
    color: var(--setup-text);
  }
  .velvet-button {
    min-width: 7rem;
    /* Inline only, so the optical shift the shared button carries survives. */
    padding-inline: 0.75rem;
  }
  /* Pushed to the far end of the card footer, away from the primary action. */
  .velvet-button--secondary {
    margin-right: auto;
  }
  button:focus-visible {
    outline: 2px solid var(--setup-accent);
    outline-offset: 3px;
  }
  a:focus-visible {
    outline: 2px solid var(--setup-accent);
    outline-offset: 3px;
  }
  /* Pinned over a page that scrolls beneath it, which is a property of this
     page rather than of a footer. */
  :global([data-page-footer]) {
    position: fixed;
    z-index: 80;
    right: 0;
    bottom: 0;
    left: 0;
    background: color-mix(in srgb, #0d0e14 88%, transparent);
    backdrop-filter: blur(16px);
  }
  /* Middle column, so the credit stays centred on the page regardless of how
     wide the serial beside it happens to be. */
  :global(::view-transition-group(root)),
  :global(::view-transition-old(root)),
  :global(::view-transition-new(root)) {
    animation: none;
    mix-blend-mode: normal;
  }
  :global(::view-transition-group(onboarding-step-card)),
  :global(::view-transition-group(onboarding-step-card-shell)),
  :global(::view-transition-old(onboarding-step-card)),
  :global(::view-transition-new(onboarding-step-card)),
  :global(::view-transition-old(onboarding-step-card-shell)),
  :global(::view-transition-new(onboarding-step-card-shell)) {
    animation-duration: 350ms;
    animation-timing-function: ease-in-out;
    animation-fill-mode: both;
    mix-blend-mode: normal;
  }
  :global(::view-transition-group(onboarding-step-card)),
  :global(::view-transition-image-pair(onboarding-step-card)) {
    overflow: clip;
  }
  :global(::view-transition-image-pair(onboarding-step-card)) {
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0,
      #000 var(--step-card-content-inset),
      #000 calc(100% - var(--step-card-content-inset)),
      transparent 100%
    );
    mask-image: linear-gradient(
      to right,
      transparent 0,
      #000 var(--step-card-content-inset),
      #000 calc(100% - var(--step-card-content-inset)),
      transparent 100%
    );
  }
  :global(html[data-onboarding-direction="forward"]::view-transition-old(onboarding-step-card)) {
    animation-name: onboarding-slide-out-forward;
  }
  :global(html[data-onboarding-direction="forward"]::view-transition-new(onboarding-step-card)) {
    animation-name: onboarding-slide-in-forward;
  }
  :global(html[data-onboarding-direction="backward"]::view-transition-old(onboarding-step-card)) {
    animation-name: onboarding-slide-out-backward;
  }
  :global(html[data-onboarding-direction="backward"]::view-transition-new(onboarding-step-card)) {
    animation-name: onboarding-slide-in-backward;
  }
  @keyframes onboarding-slide-out-forward {
    to {
      opacity: 0;
      transform: translateX(-100%);
    }
  }
  @keyframes onboarding-slide-in-forward {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
  }
  @keyframes onboarding-slide-out-backward {
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }
  @keyframes onboarding-slide-in-backward {
    from {
      opacity: 0;
      transform: translateX(-100%);
    }
  }
  @media (max-width: 720px) {
    .two-columns {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 450px) {
    main {
      width: min(100% - 1rem, 960px);
      padding-top: 2rem;
    }
    .velvet-section-heading {
      margin-inline: var(--setup-control-radius);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
    :global(::view-transition-group(root)),
    :global(::view-transition-old(root)),
    :global(::view-transition-new(root)),
    :global(::view-transition-group(onboarding-step-card)),
    :global(::view-transition-group(onboarding-step-card-shell)),
    :global(::view-transition-old(onboarding-step-card)),
    :global(::view-transition-new(onboarding-step-card)),
    :global(::view-transition-old(onboarding-step-card-shell)),
    :global(::view-transition-new(onboarding-step-card-shell)) {
      animation: none !important;
    }
  }
</style>
