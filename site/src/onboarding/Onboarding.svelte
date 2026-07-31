<script lang="ts">
  import { onMount, tick } from "svelte";
  import VelvetToolBrand from "../components/VelvetToolBrand.svelte";
  import * as ReviewList from "../components/review-list";
  import * as ServiceEditor from "../components/service-editor";
  import * as StepCard from "../components/step-card";
  import {
    STEP_CARD_CONTENT_INSET,
    STEP_CARD_INNER_RADIUS,
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
    buildSetupRequest,
    createOnboardingDraft,
    createServiceDraft,
    submitOnboarding,
    type SetupProgressStage,
  } from "./state.js";
  import SquircleStep from "./SquircleStep.svelte";
  import { SYSTEM_THEMES, systemThemeById } from "./system-themes.js";

  const STEPS = ["Basics", "Services", "Theme", "Publish"] as const;
  const CURRENT_YEAR = new Date().getFullYear();
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

  let step = $state(GITHUB_RETURN ? STEPS.length - 1 : 0);
  let draft = $state(
    loadOnboardingDraft(SESSION_STORAGE) ?? createOnboardingDraft(),
  );
  let errors = $state<Record<string, string>>({});
  let submitting = $state(false);
  let progress = $state<SetupProgressStage[]>([]);
  let resultMessage = $state("");
  let installationUrl = $state("");
  let repositoryUrl = $state("");
  let workflowUrl = $state("");
  let setupErrorId = $state("");
  let retryAvailable = $state(false);
  let submissionState = $state<"idle" | "permission-required" | "failed" | "success">("idle");
  let stepTransitionController: ViewTransitionController | null = null;
  const selectedTheme = $derived(systemThemeById(draft.themeId));
  const previousStepLabel = $derived(step > 0 ? STEPS[step - 1] : "");
  const nextStepLabel = $derived(
    step < STEPS.length - 1 ? STEPS[step + 1] : "",
  );
  const customDomain = $derived(draft.customDomain.trim().toLowerCase());
  const pagesDnsTarget = $derived(
    `${draft.repositoryOwner.trim() || "your-github-name"}.github.io`,
  );

  $effect(() => {
    persistOnboardingDraft($state.snapshot(draft), SESSION_STORAGE);
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

  function addService(): void {
    draft.services.push(createServiceDraft());
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
    }, reducedMotion);
  }

  function nextStep(): void {
    const currentErrors: Record<string, string> = {};
    if (step === 0) {
      if (!draft.repositoryOwner.trim()) currentErrors.repositoryOwner = "Enter your GitHub name.";
      if (!draft.repositoryName.trim()) currentErrors.repositoryName = "Enter a repository name.";
      if (!draft.statusPageName.trim()) currentErrors.statusPageName = "Enter a status page name.";
      const validation = buildSetupRequest(draft);
      if (!validation.success && validation.errors.customDomain) {
        currentErrors.customDomain = validation.errors.customDomain;
      }
    }
    if (step === 1) {
      draft.services.forEach((service, index) => {
        if (!service.name.trim()) currentErrors[`services.${index}.name`] = "Enter a service name.";
        if (!service.url.trim()) currentErrors[`services.${index}.url`] = "Enter a URL to monitor.";
      });
    }
    errors = currentErrors;
    if (Object.keys(currentErrors).length === 0) {
      changeStep(Math.min(step + 1, STEPS.length - 1));
    }
  }

  function previousStep(): void {
    errors = {};
    changeStep(Math.max(0, step - 1));
  }

  async function publish(): Promise<void> {
    submitting = true;
    progress = [];
    resultMessage = "";
    installationUrl = "";
    repositoryUrl = "";
    workflowUrl = "";
    setupErrorId = "";
    retryAvailable = false;
    submissionState = "idle";
    const result = await submitOnboarding(
      draft,
      createBrowserSetupClient(),
      (stage) => {
        if (!progress.includes(stage)) progress = [...progress, stage];
      },
    );
    submitting = false;
    if (result.state === "invalid") {
      errors = result.errors;
      resultMessage = "Check the highlighted entries and try again.";
      return;
    }
    if (result.state === "success") {
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
    submissionState = "failed";
    resultMessage = result.message;
    repositoryUrl = result.repositoryUrl ?? "";
    workflowUrl = result.workflowUrl ?? "";
    setupErrorId = result.errorId;
    retryAvailable = result.recoverable;
  }
</script>

<svelte:head>
  <meta name="color-scheme" content="dark" />
  <link rel="license" href={fontLicensesUrl} />
</svelte:head>

<div
  class="onboarding-shell"
  style={`--step-card-inner-radius: ${STEP_CARD_INNER_RADIUS}px`}
>
  <main>
    <section class="intro">
      <div class="onboarding-brand-block">
        <VelvetToolBrand subtitle="ONBOARDING" />
      </div>
      <p>
        Tell Velvet what to watch, choose a theme,<br />
        and publish through your GitHub account.
      </p>
    </section>

    <nav aria-label="Setup progress">
      <ol class="steps">
        {#each STEPS as label, index (label)}
          <li>
            <SquircleStep
              number={index + 1}
              {label}
              active={index === step}
              complete={index < step}
              disabled={index > step}
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
        <div class="section-heading">
          <div class="section-title">
            <span>01</span>
            <span class="separator" data-step-title-separator aria-hidden="true">//</span>
            <h2 id="identity-title">Name your status page</h2>
          </div>
          <p>Choose the GitHub account, repository, public name, and optional domain for your status page.</p>
        </div>
        <div class="form-grid two-columns">
          <label>
            <span>Your GitHub name</span>
            <input
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
            <span>Repository name</span>
            <input
              autocomplete="off"
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
            <span>Status page name</span>
            <input
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
          {#if draft.customDomain.trim()}
            <aside
              class="dns-guidance full-width"
              aria-label="Required DNS change"
            >
              <strong>DNS change required</strong>
              <p>
                DNS changes happen outside Velvet and may take time to propagate. After publishing,
                update the records at your DNS provider.
              </p>
              <ul>
                <li><b>Subdomain:</b> CNAME to <code>{pagesDnsTarget}</code></li>
                <li>
                  <b>Root domain:</b> ALIAS or ANAME to <code>{pagesDnsTarget}</code>, or A records
                  to <code>185.199.108.153</code>, <code>185.199.109.153</code>,
                  <code>185.199.110.153</code>, and <code>185.199.111.153</code>
                </li>
              </ul>
            </aside>
          {/if}
        </div>
      </StepCard.Body>

      <StepCard.Body active={step === 1} labelledBy="services-title">
        <div class="section-heading">
          <div class="section-title">
            <span>02</span>
            <span class="separator" data-step-title-separator aria-hidden="true">//</span>
            <h2 id="services-title">Add services</h2>
          </div>
          <p>Add every website, API, or endpoint you want to show. A name and URL are enough; Velvet considers a final HTTP 200 response healthy.</p>
        </div>

        <ServiceEditor.List onAdd={addService}>
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
      </StepCard.Body>

      <StepCard.Body active={step === 2} labelledBy="theme-title">
        <div class="section-heading">
          <div class="section-title">
            <span>03</span>
            <span class="separator" data-step-title-separator aria-hidden="true">//</span>
            <h2 id="theme-title">Choose a starting theme</h2>
          </div>
          <p>Choose how your status page looks when it first goes live. You can change every visual detail later in the Configurator.</p>
        </div>
        <ThemeCard.Root
          legend="System themes"
          description="Select one of the four included themes. Each preview shows its starting appearance."
        >
          {#each SYSTEM_THEMES as theme (theme.id)}
            <ThemeCard.Option
              name={theme.name}
              value={theme.id}
              screenshot={theme.screenshot}
              selected={draft.themeId === theme.id}
              radioName="system-theme"
              onSelect={(value) => (draft.themeId = value)}
            />
          {/each}
        </ThemeCard.Root>
        {#if errors.themeId}<small class="field-error">{errors.themeId}</small>{/if}
      </StepCard.Body>

      <StepCard.Body active={step === 3} labelledBy="publish-title">
        <div class="section-heading">
          <div class="section-title">
            <span>04</span>
            <span class="separator" data-step-title-separator aria-hidden="true">//</span>
            <h2 id="publish-title">Review and publish</h2>
          </div>
          <p>Review your choices. Velvet then creates the repository, starts monitoring, and publishes the status page with GitHub Pages.</p>
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
            value={selectedTheme?.name ?? "Choose a theme"}
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
        <p class="github-permission-note">
          GitHub asks for two approvals during the first setup. The first lets Velvet create the repository and is removed immediately. The second gives Velvet access only to that new repository.
        </p>

        {#if submitting || progress.length > 0}
          <ol
            class="deployment-progress"
            aria-label="Deployment progress"
          >
            {#each Object.entries(PROGRESS_LABELS) as [stage, label] (stage)}
              <li class:complete={progress.includes(stage as SetupProgressStage)}>
                <i class={`ph-duotone ${progress.includes(stage as SetupProgressStage) ? "ph-check-circle" : "ph-circle"}`} aria-hidden="true"></i>
                {label}
              </li>
            {/each}
          </ol>
        {/if}

        <div class="result" data-setup-state={submissionState} aria-live="polite">
          {#if resultMessage}<p>{resultMessage}</p>{/if}
          {#if installationUrl}<a href={installationUrl}>Open your status page</a>{/if}
          {#if repositoryUrl || workflowUrl}
            <div class="recovery-links" data-recovery-links>
              {#if repositoryUrl}<a href={repositoryUrl} target="_blank" rel="noopener noreferrer">Open repository</a>{/if}
              {#if workflowUrl}<a href={workflowUrl} target="_blank" rel="noopener noreferrer">View failed workflow</a>{/if}
            </div>
          {/if}
          {#if setupErrorId}<small>Reference: <code>{setupErrorId}</code></small>{/if}
        </div>
      </StepCard.Body>
      </div>

      <StepCard.Footer>
        {#if step > 0 && !submitting}
          <button class="secondary-button" type="button" onclick={previousStep}>
            <span data-step-card-button-label>{previousStepLabel}</span>
          </button>
        {/if}
        {#if step < STEPS.length - 1}
          <button class="primary-button" type="button" onclick={nextStep}>
            <span data-step-card-button-label>{nextStepLabel}</span>
          </button>
        {:else}
          <button class="primary-button" type="submit" disabled={submitting}>
            <span data-step-card-button-label>
              {submitting
                ? "Setting up Velvet…"
                : submissionState === "success"
                  ? "Set up again"
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
  <footer class="page-footer">
    <span>© {CURRENT_YEAR} by </span>
    <a href="https://layered.work" target="_blank" rel="noopener noreferrer">LAYERED</a>
  </footer>
</div>

<style>
  .onboarding-shell {
    --setup-accent: #8ca5ff;
    --setup-panel: rgba(27, 29, 38, 0.9);
    --setup-panel-raised: #272a36;
    --setup-card: #222530;
    --setup-input: #11131a;
    --setup-input-border: 1px solid
      color-mix(in srgb, var(--setup-text) 14%, transparent);
    --setup-text: #efedf5;
    --setup-muted: #979aa8;
    --setup-error: #ff8d9a;
    --setup-control-height: 2.5rem;
    --setup-control-radius: 0.55rem;
    --setup-text-small: 0.9375rem;
    --setup-text-body: 1rem;
    --setup-text-lead: 1.125rem;
    --setup-text-caption: 0.8125rem;
    --setup-text-intro: 2rem;
    --setup-text-copy: 1.25rem;
    --setup-card-copy: var(--setup-text-copy);
    --setup-button-font-size: var(--setup-text-body);
    --setup-font: "Barlow", "Segoe UI", sans-serif;
    --setup-heading-font: "Barlow Condensed", "Arial Narrow", sans-serif;
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
    --service-editor-copy-font-size: var(--setup-card-copy);
    --service-editor-small-font-size: var(--setup-text-small);
    --service-editor-text: var(--setup-text);
    --service-editor-text-inset: var(--setup-control-radius);
    --theme-card-description-font-size: var(--setup-card-copy);
    --theme-card-font-size: var(--setup-text-body);
    --theme-card-heading-font: var(--setup-heading-font);
    --theme-card-heading-font-size: 1.25rem;
    --theme-card-columns: repeat(3, minmax(0, 1fr));
    --theme-card-gap: 0.7rem;
    --theme-card-option-radius: var(--step-card-inner-radius);
    --theme-card-option-text-inset: 0.52rem;
    --theme-card-text-inset: 0.75rem;
    --review-card-radius: var(--step-card-inner-radius);
    min-height: 100vh;
    font-family: var(--setup-font);
    font-size: var(--setup-text-body);
  }
  .onboarding-shell :global(button) {
    min-height: var(--setup-control-height);
    border: 0;
    outline: none;
    font-size: var(--setup-button-font-size);
  }
  main {
    width: min(100% - 2rem, 960px);
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
  .onboarding-brand-block {
    width: min(100%, 270px);
    --tool-brand-width: 100%;
    --tool-brand-wordmark-size: clamp(3.5rem, 16vw, 4rem);
    --tool-brand-accent: var(--setup-accent);
    --tool-brand-text: var(--setup-text);
    --tool-brand-heading-font: var(--setup-heading-font);
    --tool-brand-subtitle-size: clamp(0.95rem, 2.5vw, 1.2rem);
    --tool-brand-scale-gap: 0.625rem;
    --tool-brand-subtitle-gap: 0.9rem;
  }
  .intro > p:last-child {
    width: 100%;
    max-width: none;
    margin: 3.5rem 0 0;
    color: color-mix(in srgb, var(--setup-muted) 78%, var(--setup-text));
    font-size: var(--setup-text-intro);
    line-height: 1.6;
  }
  .steps {
    --step-size: clamp(4.5rem, 18vw, 5.5rem);
    --step-gap: clamp(0.9rem, 4vw, 2.625rem);

    display: grid;
    grid-template-columns: repeat(4, var(--step-size));
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
  .section-heading {
    display: grid;
    gap: 0.45rem;
    margin-inline: 1rem;
    margin-bottom: 2rem;
  }
  .section-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .section-title > span {
    color: var(--setup-accent);
    font-family: var(--setup-heading-font);
    font-size: clamp(1.5rem, 3vw, 1.875rem);
    font-weight: 600;
    letter-spacing: 0.08em;
    line-height: 1.1;
  }
  .section-title .separator {
    color: var(--setup-accent);
    letter-spacing: 0;
  }
  h2 {
    margin: 0;
    color: var(--setup-text);
    font-family: var(--setup-heading-font);
    font-size: clamp(1.5rem, 3vw, 1.875rem);
    font-weight: 600;
    letter-spacing: -0.025em;
  }
  .section-heading p {
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
  label {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 0.42rem;
  }
  label > span {
    margin-inline: var(--setup-control-radius);
    color: var(--setup-text);
    font-size: var(--setup-text-body);
    font-weight: 650;
  }
  input {
    width: 100%;
    height: var(--setup-control-height);
    min-width: 0;
    padding: 0 0.75rem;
    border: var(--setup-input-border);
    border-radius: var(--setup-control-radius);
    outline: none;
    background: var(--setup-input);
    color: var(--setup-text);
    box-sizing: border-box;
    font: inherit;
  }
  input::placeholder {
    color: #747887;
  }
  input:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--setup-accent) 22%, transparent);
  }
  input[aria-invalid="true"] {
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
  .dns-guidance {
    padding: 0.9rem 1rem;
    border-radius: var(--step-card-inner-radius);
    background: var(--setup-card);
    color: var(--setup-muted);
    font-size: var(--setup-text-lead);
    line-height: 1.5;
  }
  .dns-guidance > strong,
  .dns-guidance > p,
  .dns-guidance > ul {
    margin-inline: 0.7rem;
  }
  .dns-guidance strong,
  .dns-guidance b,
  .dns-guidance code {
    color: var(--setup-text);
  }
  .dns-guidance p {
    margin-top: 0.3rem;
    margin-bottom: 0;
    font-size: var(--setup-card-copy);
  }
  .dns-guidance ul {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.65rem;
    margin-bottom: 0;
    padding-left: 1.2rem;
  }
  .dns-guidance code {
    font-family: inherit;
    overflow-wrap: anywhere;
  }
  .primary-button,
  .secondary-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--step-card-inner-radius);
    cursor: pointer;
    font-weight: 650;
    line-height: 1;
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
    color: var(--setup-accent);
    font-size: 1rem;
  }
  .result {
    min-height: 2rem;
    margin: 1rem 1rem 0;
    color: var(--setup-text);
    font-size: var(--setup-card-copy);
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
  .primary-button,
  .secondary-button {
    min-width: 7rem;
    padding: 0 0.75rem;
  }
  .primary-button {
    background: var(--setup-accent);
    color: #10131c;
  }
  .primary-button:disabled {
    cursor: wait;
    opacity: 0.65;
  }
  .secondary-button {
    margin-right: auto;
    background: var(--setup-panel-raised);
    color: var(--setup-text);
  }
  button:focus-visible {
    outline: 2px solid var(--setup-accent);
    outline-offset: 3px;
  }
  a:focus-visible {
    outline: 2px solid var(--setup-accent);
    outline-offset: 3px;
  }
  .page-footer {
    position: fixed;
    z-index: 80;
    right: 0;
    bottom: 0;
    left: 0;
    min-height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    padding: 0.5rem 1rem;
    background: color-mix(in srgb, #0d0e14 88%, transparent);
    color: var(--setup-muted);
    box-sizing: border-box;
    font-size: var(--setup-text-small);
    backdrop-filter: blur(16px);
  }
  .page-footer a {
    color: var(--setup-text);
    font-weight: 650;
    text-decoration: none;
  }
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
    .section-heading {
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
