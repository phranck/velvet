<script lang="ts">
  import { configurationIdentifierFromName } from "@velvet/contracts";

  import { disclosureMotion } from "../../lib/disclosure-motion.js";
  import {
    CURATED_SERVICE_ICONS,
    DEFAULT_SERVICE_ICON,
    iconFor,
  } from "../../lib/icons.js";
  import ServiceIconPicker from "../service-icon-picker/ServiceIconPicker.svelte";
  import {
    createHeaderDraft,
    createJsonAssertionDraft,
    type ServiceDraft,
  } from "./model.js";

  let {
    service,
    index,
    errors,
    canRemove,
    onRemove,
    serviceNameDescription,
    urlLabel = "Website URL",
    urlDescription,
  }: {
    service: ServiceDraft;
    index: number;
    errors: Record<string, string>;
    canRemove: boolean;
    onRemove: () => void;
    serviceNameDescription?: string;
    urlLabel?: string;
    urlDescription?: string;
  } = $props();

  function automaticServiceIcon(name: string): string {
    return iconFor(configurationIdentifierFromName(name));
  }

  function addHeader(): void {
    service.headers.push(createHeaderDraft());
  }

  function addAssertion(): void {
    service.jsonAssertions.push(createJsonAssertionDraft());
  }
</script>

<article class="service-editor" data-service-editor>
  <header>
    <div class="service-title">
      <i
        class={`ph-duotone ${service.icon ?? automaticServiceIcon(service.name)}`}
        aria-hidden="true"
      ></i>
      <strong>{service.name || `Service ${index + 1}`}</strong>
    </div>
    {#if canRemove}
      <button
        class="icon-button"
        type="button"
        aria-label={`Remove service ${index + 1}`}
        onclick={onRemove}
      >
        <i class="ph-duotone ph-trash" aria-hidden="true"></i>
      </button>
    {/if}
  </header>

  <div class="form-grid two-columns">
    <label>
      <span>Service name</span>
      <input
        placeholder="Website"
        bind:value={service.name}
        aria-describedby={serviceNameDescription
          ? `service-${service.id}-name-help`
          : undefined}
        aria-invalid={errors[`services.${index}.name`] ? "true" : undefined}
      />
      {#if serviceNameDescription}
        <small id={`service-${service.id}-name-help`} class="field-hint">
          {serviceNameDescription}
        </small>
      {/if}
      {#if errors[`services.${index}.name`]}
        <small class="field-error">{errors[`services.${index}.name`]}</small>
      {/if}
    </label>
    <label>
      <span>{urlLabel}</span>
      <input
        type="url"
        inputmode="url"
        placeholder="https://example.com"
        bind:value={service.url}
        aria-describedby={urlDescription
          ? `service-${service.id}-url-help`
          : undefined}
        aria-invalid={errors[`services.${index}.url`] ? "true" : undefined}
      />
      {#if urlDescription}
        <small id={`service-${service.id}-url-help`} class="field-hint">
          {urlDescription}
        </small>
      {/if}
      {#if errors[`services.${index}.url`]}
        <small class="field-error">{errors[`services.${index}.url`]}</small>
      {/if}
    </label>
  </div>

  <ServiceIconPicker
    id={`service-${service.id}-icon`}
    legend="Service icon"
    description="Optional. Automatic keeps the configuration small and chooses a matching fallback."
    value={service.icon}
    automaticIcon={service.name ? automaticServiceIcon(service.name) : DEFAULT_SERVICE_ICON}
    options={CURATED_SERVICE_ICONS}
    onChange={(value) => (service.icon = value)}
  />
  {#if errors[`services.${index}.icon`]}
    <small class="field-error">{errors[`services.${index}.icon`]}</small>
  {/if}

  <details data-advanced-open={service.advanced}>
    <summary
      onclick={(event) => {
        event.preventDefault();
        service.advanced = !service.advanced;
      }}
    >
      <span>Advanced health check</span>
      <i
        class="ph-duotone ph-caret-circle-down advanced-caret"
        aria-hidden="true"
      ></i>
    </summary>
    <div
      use:disclosureMotion={service.advanced}
      class="advanced-motion"
      data-disclosure-content
    >
      <div class="advanced-content">
        <p>
          Use this only for a dedicated health endpoint, alternate success codes,
          secret-backed request headers, or a JSON response assertion.
        </p>
        {#if errors[`services.${index}.advanced`]}
          <small class="field-error">{errors[`services.${index}.advanced`]}</small>
        {/if}

        <div class="form-grid three-columns">
          <label>
            <span>Method</span>
            <select bind:value={service.method}>
              <option value="GET">GET</option>
              <option value="HEAD">HEAD</option>
            </select>
          </label>
          <label>
            <span>Healthy status codes</span>
            <input inputmode="numeric" bind:value={service.expectedStatusCodes} />
            {#if errors[`services.${index}.expectedStatusCodes`]}
              <small class="field-error">
                {errors[`services.${index}.expectedStatusCodes`]}
              </small>
            {/if}
          </label>
          <label>
            <span>Timeout in ms</span>
            <input
              type="number"
              min="100"
              max="60000"
              step="100"
              bind:value={service.timeoutMs}
            />
            {#if errors[`services.${index}.timeoutMs`]}
              <small class="field-error">{errors[`services.${index}.timeoutMs`]}</small>
            {/if}
          </label>
          <label>
            <span>Maximum redirects</span>
            <input
              type="number"
              min="0"
              max="10"
              bind:value={service.maxRedirects}
            />
            {#if errors[`services.${index}.maxRedirects`]}
              <small class="field-error">{errors[`services.${index}.maxRedirects`]}</small>
            {/if}
          </label>
        </div>

        <div class="advanced-group">
          <div class="advanced-heading">
            <div>
              <strong>Request headers</strong>
              <span>
                Reference a GitHub Actions secret by name. Never paste its value here.
              </span>
            </div>
            <button type="button" class="small-button" onclick={addHeader}>
              Add header
            </button>
          </div>
          {#each service.headers as header, headerIndex (header.id)}
            <div class="repeatable-row">
              <label>
                <span>Header name</span>
                <input placeholder="Authorization" bind:value={header.name} />
              </label>
              <label>
                <span>Secret name</span>
                <input placeholder="API_HEALTH_TOKEN" bind:value={header.secret} />
              </label>
              <button
                class="icon-button"
                type="button"
                aria-label="Remove request header"
                onclick={() => service.headers.splice(headerIndex, 1)}
              >
                <i class="ph-duotone ph-trash" aria-hidden="true"></i>
              </button>
            </div>
          {/each}
        </div>

        <div class="advanced-group">
          <div class="advanced-heading">
            <div>
              <strong>JSON response assertions</strong>
              <span>
                Optional. Velvet ignores the response body unless you add an assertion.
              </span>
            </div>
            <button type="button" class="small-button" onclick={addAssertion}>
              Add assertion
            </button>
          </div>
          {#each service.jsonAssertions as assertion, assertionIndex (assertion.id)}
            <div class="repeatable-row assertion-row">
              <label>
                <span>JSON pointer</span>
                <input placeholder="/status" bind:value={assertion.path} />
              </label>
              <label>
                <span>Value type</span>
                <select bind:value={assertion.valueType}>
                  {#each ["string", "number", "boolean", "null"] as valueType (valueType)}
                    <option value={valueType}>{valueType}</option>
                  {/each}
                </select>
              </label>
              <label>
                <span>Expected value</span>
                <input
                  disabled={assertion.valueType === "null"}
                  bind:value={assertion.value}
                />
              </label>
              <button
                class="icon-button"
                type="button"
                aria-label="Remove JSON assertion"
                onclick={() => service.jsonAssertions.splice(assertionIndex, 1)}
              >
                <i class="ph-duotone ph-trash" aria-hidden="true"></i>
              </button>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </details>
</article>

<style>
  .service-editor {
    --picker-surface: var(--service-editor-input, #11131a);

    display: grid;
    gap: 1.35rem;
    padding: 1.15rem;
    border-radius: var(--service-editor-card-radius, 0.85rem);
    background: var(--service-editor-card, #222530);
    color: var(--service-editor-text, #efedf5);
  }
  header,
  .advanced-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  header {
    margin-inline: var(--service-editor-card-text-inset, 0);
  }
  .service-title {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }
  .service-title i {
    color: var(--service-editor-accent, #8ca5ff);
    font-size: 1.35rem;
  }
  .service-title strong {
    overflow: hidden;
    font-size: var(--service-editor-font-size, 1rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .form-grid {
    display: grid;
    gap: 1rem;
  }
  .two-columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .three-columns {
    grid-template-columns: var(
      --service-editor-health-grid-columns,
      repeat(3, minmax(0, 1fr))
    );
  }
  label {
    min-width: 0;
    display: grid;
    gap: 0.42rem;
  }
  label > span {
    margin-inline: var(--service-editor-text-inset, 0);
    color: var(--service-editor-text, #efedf5);
    font-size: var(--service-editor-font-size, 0.8rem);
    font-weight: 650;
  }
  input,
  select {
    width: 100%;
    height: var(--service-editor-control-height, 2.5rem);
    min-width: 0;
    padding: 0 0.75rem;
    border: 0;
    border-radius: var(--service-editor-control-radius, 0.55rem);
    outline: none;
    background: var(--service-editor-input, #11131a);
    color: var(--service-editor-text, #efedf5);
    box-sizing: border-box;
    font: inherit;
  }
  input {
    border: var(--service-editor-input-border, 0);
  }
  input::placeholder {
    color: var(--service-editor-placeholder, #747887);
  }
  input:focus-visible,
  select:focus-visible {
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--service-editor-accent, #8ca5ff) 22%, transparent);
  }
  input[aria-invalid="true"] {
    background: color-mix(
      in srgb,
      var(--service-editor-error, #ff8d9a) 9%,
      var(--service-editor-input, #11131a)
    );
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--service-editor-error, #ff8d9a) 70%, transparent);
  }
  input:disabled {
    opacity: 0.55;
  }
  .field-error,
  .field-hint {
    margin-inline: var(--service-editor-text-inset, 0);
  }
  .field-error {
    color: var(--service-editor-error, #ff8d9a);
    font-size: var(--service-editor-small-font-size, 0.75rem);
  }
  .field-hint {
    color: var(--service-editor-muted, #979aa8);
    font-size: var(--service-editor-caption-font-size, 0.75rem);
    line-height: 1.45;
  }
  button {
    min-height: var(--service-editor-control-height, 2.5rem);
    border: 0;
    outline: none;
    font: inherit;
  }
  .icon-button,
  .small-button {
    border-radius: var(--service-editor-control-radius, 0.55rem);
    cursor: pointer;
    font-weight: 650;
  }
  .icon-button {
    width: var(--service-editor-control-height, 2.5rem);
    height: var(--service-editor-control-height, 2.5rem);
    display: grid;
    flex: none;
    place-items: center;
    padding: 0;
    background: transparent;
    color: var(--service-editor-muted, #979aa8);
  }
  .icon-button:hover {
    color: var(--service-editor-error, #ff8d9a);
  }
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-inline: var(--service-editor-card-text-inset, 0);
    padding: 1rem 0 0;
    color: var(--service-editor-muted, #979aa8);
    cursor: pointer;
    font-size: var(--service-editor-font-size, 0.82rem);
    font-weight: 700;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:hover {
    color: var(--service-editor-text, #efedf5);
  }
  .advanced-caret {
    width: 1.25rem;
    height: 1.25rem;
    flex: none;
    font-size: 1.25rem;
    line-height: 1;
    transition: transform 200ms ease-in-out;
  }
  details[data-advanced-open="true"] .advanced-caret {
    transform: rotate(180deg);
  }
  .advanced-content {
    display: grid;
    gap: 1.35rem;
    padding-top: 1rem;
  }
  .advanced-content > p {
    margin: 0.45rem var(--service-editor-text-inset, 0) 0;
    color: var(--service-editor-muted, #979aa8);
    font-size: var(--service-editor-copy-font-size, 0.9rem);
    line-height: 1.5;
  }
  .advanced-group {
    display: grid;
    gap: 0.8rem;
    padding-top: 1rem;
  }
  .advanced-heading strong,
  .advanced-heading span {
    display: block;
  }
  .advanced-heading strong {
    font-size: var(--service-editor-font-size, 0.85rem);
  }
  .advanced-heading span {
    margin-top: 0.2rem;
    color: var(--service-editor-muted, #979aa8);
    font-size: var(--service-editor-small-font-size, 0.75rem);
  }
  .small-button {
    flex: none;
    padding: 0 var(--service-editor-button-padding-inline, 0.65rem);
    background: var(--service-editor-raised, #272a36);
    color: var(--service-editor-text, #efedf5);
    font-size: var(--service-editor-font-size, 0.75rem);
  }
  button:focus-visible {
    outline: 2px solid var(--service-editor-accent, #8ca5ff);
    outline-offset: 3px;
  }
  summary:focus-visible {
    outline: 2px solid var(--service-editor-accent, #8ca5ff);
    outline-offset: 3px;
  }
  .repeatable-row {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    align-items: end;
    gap: 0.65rem;
  }
  .assertion-row {
    grid-template-columns: 1fr 0.7fr 1fr auto;
  }

  @media (max-width: 720px) {
    .two-columns,
    .three-columns,
    .repeatable-row,
    .assertion-row {
      grid-template-columns: 1fr;
    }
    .repeatable-row .icon-button {
      justify-self: end;
    }
  }

  @media (max-width: 450px) {
    .advanced-heading {
      align-items: flex-start;
      flex-direction: column;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .advanced-caret {
      transition: none;
    }
  }
</style>
