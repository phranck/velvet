<script lang="ts">
  import { onMount } from "svelte";
  import VelvetWordmark from "../components/VelvetWordmark.svelte";
  import * as ServiceEditor from "../components/service-editor";
  import * as ThemeCard from "../components/theme-card";
  import { createBrowserSetupClient } from "./client.js";
  import {
    clearOnboardingDraft,
    loadOnboardingDraft,
    persistOnboardingDraft,
  } from "./onboarding-session.js";
  import {
    createOnboardingDraft,
    createServiceDraft,
    submitOnboarding,
    type SetupProgressStage,
  } from "./state.js";
  import { SYSTEM_THEMES, systemThemeById } from "./system-themes.js";

  const STEPS = ["Status page", "Services", "Theme", "Publish"] as const;
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
  const selectedTheme = $derived(systemThemeById(draft.themeId));

  $effect(() => {
    persistOnboardingDraft($state.snapshot(draft), SESSION_STORAGE);
  });

  onMount(() => {
    if (!GITHUB_RETURN) return;
    clearGitHubReturnParameter();
    if (GITHUB_RETURN === "approval-required") {
      submissionState = "permission-required";
      resultMessage = "A GitHub organization owner still needs to approve Velvet.";
      return;
    }
    void publish();
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

  function nextStep(): void {
    const currentErrors: Record<string, string> = {};
    if (step === 0) {
      if (!draft.repositoryOwner.trim()) currentErrors.repositoryOwner = "Enter your GitHub name.";
      if (!draft.repositoryName.trim()) currentErrors.repositoryName = "Enter a repository name.";
      if (!draft.statusPageName.trim()) currentErrors.statusPageName = "Enter a status page name.";
    }
    if (step === 1) {
      draft.services.forEach((service, index) => {
        if (!service.name.trim()) currentErrors[`services.${index}.name`] = "Enter a service name.";
        if (!service.url.trim()) currentErrors[`services.${index}.url`] = "Enter a website URL.";
      });
    }
    errors = currentErrors;
    if (Object.keys(currentErrors).length === 0) step = Math.min(step + 1, STEPS.length - 1);
  }

  function previousStep(): void {
    errors = {};
    step = Math.max(0, step - 1);
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
      resultMessage = "Your Velvet status page is ready.";
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
</svelte:head>

<div class="onboarding-shell">
  <header class="topbar">
    <a class="brand" href="../" aria-label="Velvet home">
      <VelvetWordmark />
    </a>
    <span>Setup</span>
  </header>

  <main>
    <section class="intro">
      <p class="eyebrow">Your status page, without local setup</p>
      <h1>Set up Velvet</h1>
      <p>
        Tell Velvet what to watch, choose a theme, and publish through your GitHub account.
      </p>
    </section>

    <nav class="steps" aria-label="Setup progress">
      {#each STEPS as label, index (label)}
        <button
          type="button"
          class:active={index === step}
          class:complete={index < step}
          aria-current={index === step ? "step" : undefined}
          disabled={index > step}
          onclick={() => (step = index)}
        >
          <span>{index < step ? "✓" : index + 1}</span>
          {label}
        </button>
      {/each}
    </nav>

    <form onsubmit={(event) => { event.preventDefault(); void publish(); }} novalidate>
      <section class="step-panel" hidden={step !== 0} aria-labelledby="identity-title">
        <div class="section-heading">
          <span>01</span>
          <div>
            <h2 id="identity-title">Name your status page</h2>
            <p>Velvet creates a new repository in your GitHub account.</p>
          </div>
        </div>
        <div class="form-grid two-columns">
          <label>
            <span>Repository owner</span>
            <input autocomplete="username" bind:value={draft.repositoryOwner} aria-invalid={errors.repositoryOwner ? "true" : undefined} />
            {#if errors.repositoryOwner}<small class="field-error">{errors.repositoryOwner}</small>{/if}
          </label>
          <label>
            <span>Repository name</span>
            <input autocomplete="off" bind:value={draft.repositoryName} aria-invalid={errors.repositoryName ? "true" : undefined} />
            {#if errors.repositoryName}<small class="field-error">{errors.repositoryName}</small>{/if}
          </label>
          <label class="full-width">
            <span>Status page name</span>
            <input autocomplete="organization" bind:value={draft.statusPageName} aria-invalid={errors.statusPageName ? "true" : undefined} />
            {#if errors.statusPageName}<small class="field-error">{errors.statusPageName}</small>{/if}
          </label>
        </div>
      </section>

      <section class="step-panel" hidden={step !== 1} aria-labelledby="services-title">
        <div class="section-heading">
          <span>02</span>
          <div>
            <h2 id="services-title">Add services</h2>
            <p>A normal website only needs a name and URL. Velvet checks for a final HTTP 200 response.</p>
          </div>
        </div>

        <ServiceEditor.List onAdd={addService}>
          {#each draft.services as service, serviceIndex (service.id)}
            <ServiceEditor.Root
              {service}
              index={serviceIndex}
              {errors}
              canRemove={draft.services.length > 1}
              onRemove={() => removeService(serviceIndex)}
            />
          {/each}
        </ServiceEditor.List>
      </section>

      <section class="step-panel" hidden={step !== 2} aria-labelledby="theme-title">
        <div class="section-heading">
          <span>03</span>
          <div>
            <h2 id="theme-title">Choose a starting theme</h2>
            <p>You can fine-tune every visual detail later in the Configurator.</p>
          </div>
        </div>
        <ThemeCard.Root legend="System themes" description="Four complete themes are embedded in every Velvet installation.">
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
      </section>

      <section class="step-panel" hidden={step !== 3} aria-labelledby="publish-title">
        <div class="section-heading">
          <span>04</span>
          <div>
            <h2 id="publish-title">Review and publish</h2>
            <p>Velvet validates the complete configuration before the setup service receives it.</p>
          </div>
        </div>
        <div class="review-grid">
          <div><span>Repository</span><strong>{draft.repositoryOwner}/{draft.repositoryName}</strong></div>
          <div><span>Status page</span><strong>{draft.statusPageName}</strong></div>
          <div><span>Services</span><strong>{draft.services.length}</strong></div>
          <div><span>Theme</span><strong>{selectedTheme?.name ?? "Choose a theme"}</strong></div>
        </div>
        <p class="github-permission-note">
          On a first setup, GitHub asks twice. Velvet uses the first approval only to create this repository, removes it immediately, and then asks for access to this repository alone.
        </p>

        {#if submitting || progress.length > 0}
          <ol class="deployment-progress" aria-label="Deployment progress">
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
      </section>

      <footer class="form-actions">
        {#if step > 0 && !submitting}
          <button class="secondary-button" type="button" onclick={previousStep}>Back</button>
        {/if}
        {#if step < STEPS.length - 1}
          <button class="primary-button" type="button" onclick={nextStep}>Continue</button>
        {:else}
          <button class="primary-button" type="submit" disabled={submitting}>
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
          </button>
        {/if}
      </footer>
    </form>
  </main>

  <footer class="page-footer">
    <span>Monitoring and publishing with GitHub</span>
  </footer>
</div>

<style>
  .onboarding-shell {
    --setup-accent: #8ca5ff;
    --setup-panel: rgba(27, 29, 38, 0.9);
    --setup-panel-raised: #272a36;
    --setup-card: #222530;
    --setup-input: #11131a;
    --setup-text: #efedf5;
    --setup-muted: #979aa8;
    --setup-error: #ff8d9a;
    --setup-control-height: 2.5rem;
    --setup-control-radius: 0.55rem;
    --picker-accent: var(--setup-accent);
    --picker-muted: var(--setup-muted);
    --picker-popover: var(--setup-panel-raised);
    --picker-surface: var(--setup-card);
    --picker-text: var(--setup-text);
    --service-editor-accent: var(--setup-accent);
    --service-editor-card: var(--setup-card);
    --service-editor-control-height: var(--setup-control-height);
    --service-editor-control-radius: var(--setup-control-radius);
    --service-editor-error: var(--setup-error);
    --service-editor-input: var(--setup-input);
    --service-editor-muted: var(--setup-muted);
    --service-editor-raised: var(--setup-panel-raised);
    --service-editor-text: var(--setup-text);
    min-height: 100vh;
  }
  .onboarding-shell button {
    min-height: var(--setup-control-height);
    border: 0;
    outline: none;
  }
  .topbar {
    max-width: 1120px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 auto;
    padding: 1.35rem 1.5rem;
  }
  .brand {
    --velvet-wordmark-size: 1.9rem;

    color: var(--setup-accent);
    text-decoration: none;
  }
  .topbar > span {
    color: var(--setup-muted);
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  main {
    width: min(100% - 2rem, 960px);
    margin: 0 auto;
    padding: clamp(2.5rem, 7vw, 5.5rem) 0 4rem;
  }
  .intro {
    max-width: 680px;
    margin-bottom: 2.5rem;
  }
  .eyebrow {
    margin: 0 0 0.75rem;
    color: var(--setup-accent);
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  h1 {
    margin: 0;
    font-size: clamp(2.4rem, 7vw, 4.5rem);
    font-weight: 760;
    letter-spacing: -0.055em;
    line-height: 0.98;
  }
  .intro > p:last-child {
    max-width: 590px;
    margin: 1.25rem 0 0;
    color: var(--setup-muted);
    font-size: clamp(1rem, 2vw, 1.15rem);
    line-height: 1.6;
  }
  .steps {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .steps button {
    height: var(--setup-control-height);
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.35rem 0.7rem;
    border-radius: var(--setup-control-radius);
    background: var(--setup-card);
    color: var(--setup-muted);
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 650;
    text-align: left;
  }
  .steps button:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .steps button.active {
    background: color-mix(in srgb, var(--setup-accent) 14%, var(--setup-card));
    color: var(--setup-text);
  }
  .steps button.complete {
    color: var(--setup-text);
  }
  .steps button > span {
    width: 1.35rem;
    height: 1.35rem;
    display: grid;
    flex: none;
    place-items: center;
    border-radius: 50%;
    background: var(--setup-panel-raised);
    color: var(--setup-accent);
    font-size: 0.7rem;
  }
  form {
    overflow: visible;
    border-radius: 1rem;
    background: var(--setup-panel);
    box-shadow: 0 1.5rem 5rem rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(18px);
  }
  .step-panel {
    min-height: 27rem;
    padding: clamp(1.25rem, 4vw, 2.4rem);
  }
  .step-panel[hidden] {
    display: none;
  }
  .section-heading {
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .section-heading > span {
    padding-top: 0.2rem;
    color: var(--setup-accent);
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
  }
  h2 {
    margin: 0;
    color: var(--setup-text);
    font-size: clamp(1.35rem, 3vw, 1.75rem);
    letter-spacing: -0.025em;
  }
  .section-heading p {
    margin: 0.45rem 0 0;
    color: var(--setup-muted);
    font-size: 0.9rem;
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
    gap: 0.42rem;
  }
  label > span {
    color: var(--setup-text);
    font-size: 0.8rem;
    font-weight: 650;
  }
  input {
    width: 100%;
    height: var(--setup-control-height);
    min-width: 0;
    padding: 0 0.75rem;
    border: 0;
    border-radius: var(--setup-control-radius);
    outline: none;
    background: var(--setup-input);
    color: var(--setup-text);
    box-sizing: border-box;
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
  .field-error {
    color: var(--setup-error);
    font-size: 0.75rem;
  }
  .form-actions,
  .page-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .primary-button,
  .secondary-button {
    border-radius: var(--setup-control-radius);
    cursor: pointer;
    font-weight: 650;
  }
  .review-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .review-grid > div {
    display: grid;
    gap: 0.3rem;
    padding: 1rem;
    border-radius: 0.7rem;
    background: var(--setup-card);
  }
  .review-grid span {
    color: var(--setup-muted);
    font-size: 0.72rem;
    text-transform: uppercase;
  }
  .review-grid strong {
    overflow-wrap: anywhere;
  }
  .github-permission-note {
    margin: 1rem 0 0;
    color: var(--setup-muted);
    font-size: 0.82rem;
    line-height: 1.5;
  }
  .deployment-progress {
    display: grid;
    gap: 0.6rem;
    margin: 1.4rem 0 0;
    padding: 1rem;
    border-radius: 0.7rem;
    background: var(--setup-card);
    list-style: none;
  }
  .deployment-progress li {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    color: var(--setup-muted);
    font-size: 0.82rem;
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
    margin-top: 1rem;
    color: var(--setup-text);
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
  }
  .result code {
    color: var(--setup-text);
  }
  .form-actions {
    min-height: 4rem;
    justify-content: flex-end;
    padding: 0.55rem clamp(1.25rem, 4vw, 2.4rem);
    border-radius: 0 0 1rem 1rem;
    background: rgba(16, 17, 22, 0.75);
  }
  .primary-button,
  .secondary-button {
    min-width: 7.5rem;
    padding: 0 0.9rem;
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
  button:focus-visible,
  a:focus-visible {
    outline: 2px solid var(--setup-accent);
    outline-offset: 3px;
  }
  .page-footer {
    width: min(100% - 2rem, 960px);
    justify-content: center;
    flex-wrap: wrap;
    margin: 0 auto;
    padding: 0 0 2.5rem;
    color: var(--setup-muted);
    font-size: 0.72rem;
  }
  @media (max-width: 720px) {
    .steps {
      grid-template-columns: repeat(2, 1fr);
    }
    .two-columns,
    .review-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 450px) {
    main {
      width: min(100% - 1rem, 960px);
      padding-top: 2rem;
    }
    .steps button {
      padding: 0.6rem;
      font-size: 0.72rem;
    }
    .section-heading {
      gap: 0.65rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
