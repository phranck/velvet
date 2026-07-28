<script lang="ts">
  import { onMount } from "svelte";
  import StatusPage from "../components/StatusPage.svelte";
  import VelvetWordmark from "../components/VelvetWordmark.svelte";
  import {
    applyTheme,
    type VelvetConfig,
    type VelvetLayout,
  } from "../lib/config";
  import {
    CARD_WIDTH_STEPS,
    PALETTE_KEYS,
    resolveTheme,
  } from "../lib/theme.js";
  import type { RangeKey } from "../lib/types";
  import ColorControl from "./ColorControl.svelte";
  import ColorSourceControl from "./ColorSourceControl.svelte";
  import ConfiguratorSection from "./ConfiguratorSection.svelte";
  import * as Slider from "./slider";
  import ThemeDropdown from "./ThemeDropdown.svelte";
  import {
    cloneConfiguratorTheme,
    exportConfigurationYaml,
    exportVelvetYaml,
    parseConfiguratorYaml,
    type ConfiguratorDocument,
    type ConfiguratorSettings,
    type ConfiguratorTheme,
  } from "./configuration";
  import { DEFAULT_CONFIGURATION_FILENAME } from "./configuration-filename.js";
  import {
    loadConfigurationFileHandle,
    pickConfigurationFile,
    requestWritePermission,
    saveConfigurationFileHandle,
    supportsFileSystemAccess,
    writeConfigurationFile,
  } from "./file-system-access.js";
  import {
    loadConfiguratorSession,
    persistConfiguratorSession,
  } from "./configurator-session.js";
  import {
    exportedSettingsFingerprint,
    isConfiguratorDirty,
    saveShortcutAction,
  } from "./configurator-state";
  import {
    createScrollCompensation,
    type ScrollCompensationController,
  } from "./scroll-motion";
  import {
    CONFIGURATOR_SECTION_IDS,
    parseSidebarCollapsed,
    parseSectionState,
    serializeSidebarCollapsed,
    serializeSectionState,
    setAllSectionState,
    type ConfiguratorSectionId,
    type ConfiguratorSectionState,
  } from "./section-state";
  import {
    EMBEDDED_THEME_REGISTRY,
    loadThemeRegistry,
    type RegistryTheme,
  } from "./theme-registry";
  import {
    PREVIEW_CONFIG,
    PREVIEW_INCIDENTS,
    PREVIEW_RESPONSE_TIMES,
    PREVIEW_STATUS,
  } from "./preview";

  type PaletteKey = (typeof PALETTE_KEYS)[number];
  interface PaletteField {
    key: PaletteKey;
    label: string;
  }

  const DEFAULT_SETTINGS = parseConfiguratorYaml("").settings;
  const SECTION_STORAGE_KEY = "velvet.configurator.sections.v1";
  const SIDEBAR_STORAGE_KEY = "velvet.configurator.sidebar.v1";
  const RESTORED_SESSION = loadConfiguratorSession(
    typeof localStorage === "undefined" ? null : localStorage,
  );
  const INITIAL_SETTINGS = RESTORED_SESSION?.settings ?? DEFAULT_SETTINGS;
  const LINE_STYLES = ["solid", "dashed", "dotted"] as const;
  const CARD_WIDTH_OPTIONS = CARD_WIDTH_STEPS.map((value, index) => ({
    value,
    label: ["Min", "Default", "Wide", "Max"][index],
    output: `${value} px`,
  }));
  const BLOB_COUNT_OPTIONS = Array.from({ length: 5 }, (_, index) => ({
    value: index + 1,
    label: `${index + 1}`,
    output: `${index + 1}`,
  }));
  const SLIDER_COLORS = {
    active: "var(--tool-accent)",
    inactive: "var(--tool-line)",
    thumb: "var(--tool-accent)",
    innerRing: "#fff",
    outerRing: "#000",
  } satisfies Slider.SliderColors;
  const PALETTE_FIELDS: PaletteField[] = [
    { key: "canvas", label: "Canvas" },
    { key: "foreground", label: "Foreground" },
    { key: "accent", label: "Accent" },
    { key: "alternate", label: "Alternate" },
    { key: "warning", label: "Warning" },
    { key: "danger", label: "Danger" },
    { key: "textPrimary", label: "Text Primary" },
    { key: "textSecondary", label: "Text Secondary" },
    { key: "textTertiary", label: "Text Tertiary" },
  ];

  function readStoredSectionState() {
    try {
      return parseSectionState(
        typeof localStorage === "undefined"
          ? null
          : localStorage.getItem(SECTION_STORAGE_KEY),
      );
    } catch {
      return parseSectionState(null);
    }
  }

  function readStoredSidebarCollapsed(): boolean {
    try {
      return parseSidebarCollapsed(
        typeof localStorage === "undefined"
          ? null
          : localStorage.getItem(SIDEBAR_STORAGE_KEY),
      );
    } catch {
      return false;
    }
  }

  let layout = $state<VelvetLayout>(INITIAL_SETTINGS.layout);
  let themeConfiguration = $state<ConfiguratorTheme>(
    cloneConfiguratorTheme(INITIAL_SETTINGS.theme),
  );
  let sectionState = $state(readStoredSectionState());
  let sidebarCollapsed = $state(readStoredSidebarCollapsed());
  let importedDocument = $state<ConfiguratorDocument | null>(
    RESTORED_SESSION?.importedDocument ?? null,
  );
  let importedFilename = $state(
    RESTORED_SESSION?.importedFilename ?? DEFAULT_CONFIGURATION_FILENAME,
  );
  let configurationFileHandle = $state<FileSystemFileHandle | null>(null);
  let configurationFileHandleNeedsPermission = false;
  let range = $state<RangeKey>("month");
  let notice = $state(
    RESTORED_SESSION
      ? "Previous configuration restored from this browser."
      : "Ready. Your configuration stays in this browser.",
  );
  let importError = $state("");
  let previewWorkspace = $state<HTMLElement>();
  let controlScroll = $state<HTMLElement>();
  let scrollMotion: ScrollCompensationController | null = null;
  let previewOpenMap = $state<Record<string, boolean>>({
    website: true,
    backend: true,
  });
  let registryThemes = $state<RegistryTheme[]>([
    ...EMBEDDED_THEME_REGISTRY.themes,
  ]);
  let selectedThemeId = $state<string | null>(
    RESTORED_SESSION ? RESTORED_SESSION.selectedThemeId : "velvet-default",
  );
  let loadedThemeName = $state(
    RESTORED_SESSION?.loadedThemeName ?? "Velvet Default",
  );
  let selectedBaseline = $state(
    RESTORED_SESSION?.selectedBaseline ??
      exportedSettingsFingerprint(DEFAULT_SETTINGS),
  );

  const theme = $derived(resolveTheme(themeConfiguration));
  const settings = $derived<ConfiguratorSettings>({
    layout,
    theme: themeConfiguration,
  });
  const previewConfig = $derived<VelvetConfig>({
    ...PREVIEW_CONFIG,
    layout,
    theme,
  });
  const settingsDirty = $derived(
    isConfiguratorDirty(settings, selectedBaseline),
  );
  const allSectionsOpen = $derived(
    CONFIGURATOR_SECTION_IDS.every((id) => sectionState[id]),
  );
  const directFileSavesAvailable =
    typeof window !== "undefined" && supportsFileSystemAccess(window);

  $effect(() => {
    if (previewWorkspace) applyTheme(previewConfig, previewWorkspace);
  });

  $effect(() => {
    persistConfiguratorSession(
      {
        settings,
        importedDocument:
          importedDocument === null
            ? null
            : $state.snapshot(importedDocument),
        importedFilename,
        selectedThemeId,
        loadedThemeName,
        selectedBaseline,
      },
      typeof localStorage === "undefined" ? null : localStorage,
    );
  });

  onMount(() => {
    void refreshThemeRegistry();
    void restoreConfigurationFileHandle();
    if (controlScroll) scrollMotion = createScrollCompensation(controlScroll);
    const handleSaveShortcut = (event: KeyboardEvent) => {
      const action = saveShortcutAction(event);
      if (action === null) return;
      event.preventDefault();
      void (
        action === "save-as" && directFileSavesAvailable
          ? requestSaveConfigurationAs()
          : requestSaveConfiguration()
      );
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => {
      scrollMotion?.destroy();
      window.removeEventListener("keydown", handleSaveShortcut);
    };
  });

  function applySettings(value: ConfiguratorSettings): void {
    layout = value.layout;
    themeConfiguration = cloneConfiguratorTheme(value.theme);
  }

  async function refreshThemeRegistry(): Promise<void> {
    const loaded = await loadThemeRegistry();
    registryThemes = loaded.registry.themes;
    if (!registryThemes.some(({ id }) => id === selectedThemeId)) {
      selectedThemeId = null;
    }
  }

  function selectTheme(entry: RegistryTheme): void {
    const nextTheme = cloneConfiguratorTheme(entry.theme);
    themeConfiguration = nextTheme;
    selectedThemeId = entry.id;
    loadedThemeName = entry.name;
    selectedBaseline = exportedSettingsFingerprint({ layout, theme: nextTheme });
    notice = "Theme loaded from the registry.";
    importError = "";
  }

  function updatePalette(key: PaletteKey, value: string): void {
    themeConfiguration.palette[key] = value;
  }

  function togglePreviewService(serviceId: string): void {
    previewOpenMap = {
      ...previewOpenMap,
      [serviceId]: !previewOpenMap[serviceId],
    };
  }

  function setAllPreviewServices(open: boolean): void {
    previewOpenMap = Object.fromEntries(
      PREVIEW_STATUS.services.map(({ id }) => [id, open]),
    );
  }

  function persistSectionState(value: ConfiguratorSectionState): void {
    try {
      localStorage.setItem(
        SECTION_STORAGE_KEY,
        serializeSectionState(value),
      );
    } catch {
      // The configurator still works when local storage is unavailable.
    }
  }

  function persistSidebarCollapsed(value: boolean): void {
    try {
      localStorage.setItem(
        SIDEBAR_STORAGE_KEY,
        serializeSidebarCollapsed(value),
      );
    } catch {
      // The configurator still works when local storage is unavailable.
    }
  }

  function changeSectionState(
    nextState: ConfiguratorSectionState,
  ): void {
    scrollMotion?.cancel();
    const collapsingHeight = CONFIGURATOR_SECTION_IDS.reduce((total, id) => {
      if (!sectionState[id] || nextState[id]) return total;
      const content = controlScroll?.querySelector<HTMLElement>(
        `[data-configurator-section="${id}"] [data-section-content]`,
      );
      return total + (content?.getBoundingClientRect().height ?? 0);
    }, 0);
    if (collapsingHeight > 0) {
      scrollMotion?.compensate(
        collapsingHeight,
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
      );
    }
    sectionState = nextState;
    persistSectionState(nextState);
  }

  function toggleSection(
    id: ConfiguratorSectionId,
    open: boolean,
  ): void {
    if (sectionState[id] === open) return;
    changeSectionState({ ...sectionState, [id]: open });
  }

  function toggleAllSections(): void {
    changeSectionState(setAllSectionState(!allSectionsOpen));
  }

  function toggleSidebar(): void {
    sidebarCollapsed = !sidebarCollapsed;
    persistSidebarCollapsed(sidebarCollapsed);
  }

  async function importFile(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      const parsed = parseConfiguratorYaml(await file.text());
      applySettings(parsed.settings);
      selectedThemeId = null;
      loadedThemeName = parsed.settings.theme.name;
      selectedBaseline = exportedSettingsFingerprint(parsed.settings);
      importedDocument = parsed.document;
      importedFilename = file.name;
      importError = "";
      notice = `${file.name} opened. Unrelated YAML fields will be preserved.`;
    } catch (error) {
      importError = (error as Error).message;
      notice = "Import failed. The active preview was not changed.";
    }
  }

  async function copyVelvetBlock(): Promise<void> {
    const source = exportVelvetYaml(importedDocument ?? {}, settings);
    try {
      await writeClipboard(source);
      notice = "Config copied to the clipboard.";
      importError = "";
    } catch (error) {
      importError = (error as Error).message;
      notice = "Clipboard access failed. Save the configuration instead.";
    }
  }

  async function restoreConfigurationFileHandle(): Promise<void> {
    configurationFileHandle = await loadConfigurationFileHandle();
    configurationFileHandleNeedsPermission = configurationFileHandle !== null;
  }

  async function requestSaveConfiguration(): Promise<void> {
    await saveConfiguration(settings);
  }

  async function requestSaveConfigurationAs(): Promise<void> {
    await saveConfiguration(settings, DEFAULT_CONFIGURATION_FILENAME, true);
  }

  async function saveConfiguration(
    value: ConfiguratorSettings,
    filename = importedFilename,
    chooseNewFile = false,
  ): Promise<boolean> {
    const source = exportConfigurationYaml(importedDocument, value);
    if (directFileSavesAvailable) {
      try {
        let handle = chooseNewFile ? null : configurationFileHandle;
        let requiresPermission = !chooseNewFile && configurationFileHandleNeedsPermission;
        if (handle === null) {
          handle = await pickConfigurationFile(filename);
          requiresPermission = false;
        }
        if (requiresPermission && !(await requestWritePermission(handle))) {
          notice = "File access was not granted.";
          importError = "";
          return false;
        }
        await writeConfigurationFile(handle, source);
        const handlePersisted = await saveConfigurationFileHandle(handle);
        configurationFileHandle = handle;
        configurationFileHandleNeedsPermission = false;
        importedFilename = handle.name || filename;
        selectedBaseline = exportedSettingsFingerprint(value);
        notice = handlePersisted
          ? `Saved ${importedFilename}.`
          : `Saved ${importedFilename}. Select it again after reopening this page.`;
        importError = "";
        return true;
      } catch (error) {
        if ((error as DOMException).name === "AbortError") {
          notice = "Save cancelled.";
          importError = "";
          return false;
        }
        notice = "Could not save the configuration.";
        importError = "The selected file could not be written.";
        return false;
      }
    }

    const blob = new Blob([source], { type: "application/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    selectedBaseline = exportedSettingsFingerprint(value);
    notice = `Downloaded ${filename}.`;
    importError = "";
    return true;
  }

  function resetAppearance(): void {
    const defaultTheme = EMBEDDED_THEME_REGISTRY.themes[0];
    applySettings({ ...DEFAULT_SETTINGS, theme: defaultTheme.theme });
    selectedThemeId = defaultTheme.id;
    loadedThemeName = defaultTheme.name;
    selectedBaseline = exportedSettingsFingerprint({
      ...DEFAULT_SETTINGS,
      theme: defaultTheme.theme,
    });
    notice = "Appearance reset to Velvet defaults.";
    importError = "";
  }

  async function writeClipboard(source: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(source);
        return;
      } catch {
        // file:// pages may deny the modern Clipboard API; use the local fallback.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = source;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("This browser blocked clipboard access.");
  }
</script>

<div class="configurator">
  <main class="preview-workspace" bind:this={previewWorkspace}>
    <header class="preview-header">
      <div>
        <span>Live preview</span>
        <strong>Two services, every visual state</strong>
      </div>
      <span class="preview-size">Status page</span>
    </header>
    <section class="preview-surface">
      <StatusPage
        config={previewConfig}
        showNavigation={false}
        statusDocument={PREVIEW_STATUS}
        responseTimesDocument={PREVIEW_RESPONSE_TIMES}
        incidentsDocument={PREVIEW_INCIDENTS}
        {range}
        openMap={previewOpenMap}
        updated="Jul 27, 2026, 12:00 PM"
        onSelectRange={(value) => (range = value)}
        onToggleAll={setAllPreviewServices}
        onToggleService={togglePreviewService}
      />
    </section>
  </main>

  <aside
    class="control-panel"
    class:collapsed={sidebarCollapsed}
    aria-label="Velvet configuration controls"
  >
    {#if sidebarCollapsed}
      <button
        class="sidebar-toggle sidebar-rail-toggle"
        data-sidebar-expand-toggle
        type="button"
        aria-label="Expand sidebar"
        title="Expand sidebar"
        aria-expanded={false}
        aria-controls="velvet-configurator-sidebar-content"
        onclick={toggleSidebar}
      >
        <i class="ph-duotone ph-caret-circle-double-left" aria-hidden="true"></i>
      </button>
    {/if}

    <div
      id="velvet-configurator-sidebar-content"
      class="sidebar-shell"
      inert={sidebarCollapsed}
      aria-hidden={sidebarCollapsed}
    >
      <div class="control-scroll" bind:this={controlScroll}>
      <header class="tool-header">
      <button
        class="sidebar-toggle sidebar-header-toggle"
        class:expanded={!sidebarCollapsed}
        data-sidebar-collapse-toggle
        type="button"
        aria-label="Collapse sidebar"
        title="Collapse sidebar"
        aria-expanded={true}
        aria-controls="velvet-configurator-sidebar-content"
        onclick={toggleSidebar}
      >
        <i class="ph-duotone ph-caret-circle-double-left" aria-hidden="true"></i>
      </button>
      <div class="local-label"><span></span>Local only</div>
      <h1>
        <VelvetWordmark />
        <span class="tool-subtitle">configurator</span>
      </h1>
      <div class="live-swatches" aria-hidden="true">
        {#each PALETTE_KEYS as key}
          <span style:background={themeConfiguration.palette[key]}></span>
        {/each}
      </div>
      </header>

      <div class="file-actions">
      <label class="button secondary" for="yaml-file">
        <i class="ph-duotone ph-folder-open" aria-hidden="true"></i>
        Open Config
      </label>
      <input
        id="yaml-file"
        class="visually-hidden"
        type="file"
        accept=".yml,.yaml,text/yaml,application/yaml"
        onchange={(event) => importFile(event.currentTarget.files?.[0])}
      />
      <button class="button secondary" type="button" onclick={copyVelvetBlock}>
        <i class="ph-duotone ph-copy" aria-hidden="true"></i>
        Copy Config
      </button>
      {#if directFileSavesAvailable}
        <button class="button primary" type="button" onclick={requestSaveConfiguration}>
          <i class="ph-duotone ph-download-simple" aria-hidden="true"></i>
          Save Config
        </button>
        <button class="button secondary save-as" type="button" onclick={requestSaveConfigurationAs}>
          <i class="ph-duotone ph-download-simple" aria-hidden="true"></i>
          Save Config as
        </button>
      {:else}
        <button class="button primary" type="button" onclick={requestSaveConfiguration}>
          <i class="ph-duotone ph-download-simple" aria-hidden="true"></i>
          Download Config
        </button>
      {/if}
      </div>

      <div class="theme-status" data-dirty-status={settingsDirty ? "" : undefined}>
        {#if settingsDirty}<span class="dirty-dot" aria-hidden="true"></span>{/if}
        <span>Loaded {loadedThemeName}.</span>
        {#if settingsDirty}<strong>Modified</strong>{/if}
      </div>

      <div class="message" aria-live="polite">
        <p>{notice}</p>
        {#if importError}<p class="error">{importError}</p>{/if}
      </div>

      <div class="section-toolbar">
        <button
          type="button"
          data-toggle-all-sections
          aria-expanded={allSectionsOpen}
          onclick={toggleAllSections}
        >
          <span>{allSectionsOpen ? "Collapse all sections" : "Expand all sections"}</span>
          <i
            class="ph-duotone ph-caret-circle-double-down"
            class:expanded={allSectionsOpen}
            aria-hidden="true"
          ></i>
        </button>
      </div>

      <div class="control-sections">
      <ConfiguratorSection
        id="themes"
        title="Theme"
        icon="ph-sparkle"
        open={sectionState.themes}
        onToggle={toggleSection}
      >
        <p class="section-help">Start from a community theme or keep editing locally.</p>
        <ThemeDropdown
          themes={registryThemes}
          selectedId={selectedThemeId}
          currentName={themeConfiguration.name}
          currentPalette={themeConfiguration.palette}
          modified={settingsDirty}
          onSelect={selectTheme}
        />
        <label class="text-control" for="theme-name">
          <span>Theme name</span>
          <input
            id="theme-name"
            name="theme-name"
            maxlength="80"
            bind:value={themeConfiguration.name}
          />
        </label>
      </ConfiguratorSection>

      <ConfiguratorSection
        id="palette"
        title="Named colors"
        icon="ph-palette"
        open={sectionState.palette}
        onToggle={toggleSection}
      >
        <p class="section-help">Six linked colors drive the complete page.</p>
        <div class="color-list">
          {#each PALETTE_FIELDS as field (field.key)}
            <ColorControl
              name={`palette-${field.key}`}
              label={field.label}
              value={themeConfiguration.palette[field.key]}
              onChange={(value) => updatePalette(field.key, value)}
            />
          {/each}
        </div>
      </ConfiguratorSection>

      <ConfiguratorSection
        id="layout"
        title="Service layout"
        icon="ph-layout"
        open={sectionState.layout}
        onToggle={toggleSection}
      >
        <p class="section-help">Choose whether services share a card or stand alone.</p>
        <div class="segmented">
          <label>
            <input type="radio" name="layout" value="grouped" bind:group={layout} />
            <span>Grouped</span>
          </label>
          <label>
            <input type="radio" name="layout" value="cards" bind:group={layout} />
            <span>Separate cards</span>
          </label>
        </div>
      </ConfiguratorSection>

      <ConfiguratorSection
        id="chart"
        title="Response graph"
        icon="ph-chart-line-up"
        open={sectionState.chart}
        onToggle={toggleSection}
      >
        <ColorSourceControl
          name="chart-background"
          label="Canvas color"
          source={themeConfiguration.chart.background}
          automaticColor={theme.chart.background}
          palette={themeConfiguration.palette}
          onChange={(value) => (themeConfiguration.chart.background = value)}
        />
        <Slider.Root
          id="chart-background-opacity"
          label="Canvas opacity"
          value={themeConfiguration.chart.backgroundOpacity}
          min={0}
          max={1}
          step={0.05}
          output={`${Math.round(themeConfiguration.chart.backgroundOpacity * 100)}%`}
          colors={SLIDER_COLORS}
          onChange={(value) => (themeConfiguration.chart.backgroundOpacity = value)}
        >
          <Slider.Header />
          <Slider.Control />
        </Slider.Root>
        <div class="line-style-control">
          <span>IPv4 line</span>
          <div class="segmented line-styles">
            {#each LINE_STYLES as option}
              <label>
                <input
                  type="radio"
                  name="ipv4-line-style"
                  value={option}
                  bind:group={themeConfiguration.chart.ipv4LineStyle}
                />
                <span>{option}</span>
              </label>
            {/each}
          </div>
        </div>
        <div class="line-style-control">
          <span>IPv6 line</span>
          <div class="segmented line-styles">
            {#each LINE_STYLES as option}
              <label>
                <input
                  type="radio"
                  name="ipv6-line-style"
                  value={option}
                  bind:group={themeConfiguration.chart.ipv6LineStyle}
                />
                <span>{option}</span>
              </label>
            {/each}
          </div>
        </div>
        <div class="switch-row">
          <div>
            <strong>Chart fill</strong>
            <span>Fade each protocol color below its line</span>
          </div>
          <label class="switch">
            <input
              id="chart-fill"
              name="chart-fill"
              type="checkbox"
              bind:checked={themeConfiguration.chart.fill}
            />
            <span aria-hidden="true"></span>
            <span class="visually-hidden">Chart fill</span>
          </label>
        </div>
      </ConfiguratorSection>

      <ConfiguratorSection
        id="background"
        title="Background"
        icon="ph-cloud"
        open={sectionState.background}
        onToggle={toggleSection}
      >
        <div class="background-gradient">
          <ColorSourceControl name="background-start" label="Background top" source={themeConfiguration.background.start} automaticColor={theme.background.start} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.background.start = value)} />
          <ColorSourceControl name="background-end" label="Background bottom" source={themeConfiguration.background.end} automaticColor={theme.background.end} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.background.end = value)} />
        </div>
        <div class="switch-row">
          <div>
            <strong>Cloudy blobs</strong>
            <span>Stable, repository-specific placement</span>
          </div>
          <label class="switch">
            <input
              id="cloudy-blobs-enabled"
              name="cloudy-blobs-enabled"
              type="checkbox"
              bind:checked={themeConfiguration.background.blobs.enabled}
            />
            <span aria-hidden="true"></span>
            <span class="visually-hidden">Cloudy blobs</span>
          </label>
        </div>
        <Slider.Root
          id="blob-count"
          label="Blob count"
          value={themeConfiguration.background.blobs.count}
          options={BLOB_COUNT_OPTIONS}
          colors={SLIDER_COLORS}
          onChange={(value) => (themeConfiguration.background.blobs.count = value)}
        >
          <Slider.Header />
          <Slider.Control tickmarks />
          <Slider.Labels />
        </Slider.Root>
      </ConfiguratorSection>

      <ConfiguratorSection
        id="cards"
        title="Cards"
        icon="ph-cards"
        open={sectionState.cards}
        onToggle={toggleSection}
      >
        <div class="switch-row">
          <div>
            <strong>Card border</strong>
            <span>Separators remain visible when disabled</span>
          </div>
          <label class="switch">
            <input
              id="card-border-enabled"
              name="card-border-enabled"
              type="checkbox"
              bind:checked={themeConfiguration.card.borderEnabled}
            />
            <span aria-hidden="true"></span>
            <span class="visually-hidden">Card border</span>
          </label>
        </div>
        <div class="switch-row">
          <div>
            <strong>Card shadow</strong>
            <span>Add depth below each service card</span>
          </div>
          <label class="switch">
            <input
              id="card-shadow-enabled"
              name="card-shadow-enabled"
              type="checkbox"
              bind:checked={themeConfiguration.card.shadowEnabled}
            />
            <span aria-hidden="true"></span>
            <span class="visually-hidden">Card shadow</span>
          </label>
        </div>
        <Slider.Root
          id="card-width"
          label="Card width"
          value={themeConfiguration.card.maxWidth}
          options={CARD_WIDTH_OPTIONS}
          colors={SLIDER_COLORS}
          onChange={(value) => (themeConfiguration.card.maxWidth = value)}
        >
          <Slider.Header />
          <Slider.Control tickmarks />
          <Slider.Labels />
        </Slider.Root>
        <Slider.Root
          id="card-radius"
          label="Corner radius"
          value={themeConfiguration.card.radius}
          min={0}
          max={32}
          step={1}
          output={`${themeConfiguration.card.radius} px`}
          colors={SLIDER_COLORS}
          onChange={(value) => (themeConfiguration.card.radius = value)}
        >
          <Slider.Header />
          <Slider.Control />
        </Slider.Root>
        <Slider.Root
          id="card-padding"
          label="Equal padding"
          value={themeConfiguration.card.padding}
          min={0}
          max={32}
          step={1}
          output={`${themeConfiguration.card.padding} px`}
          colors={SLIDER_COLORS}
          onChange={(value) => (themeConfiguration.card.padding = value)}
        >
          <Slider.Header />
          <Slider.Control />
        </Slider.Root>
      </ConfiguratorSection>

      <ConfiguratorSection
        id="advanced"
        title="Advanced overrides"
        icon="ph-sliders-horizontal"
        open={sectionState.advanced}
        onToggle={toggleSection}
      >
        <p class="section-help">
          Keep Theme Default, link a named color, or set a custom value.
        </p>
        <div class="override-groups">
          <div class="override-group">
            <h3>Status grid</h3>
            <ColorSourceControl name="grid-operational" label="Operational" source={themeConfiguration.grid.operational} automaticColor={theme.grid.operational} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.grid.operational = value)} />
            <ColorSourceControl name="grid-degraded" label="Degraded" source={themeConfiguration.grid.degraded} automaticColor={theme.grid.degraded} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.grid.degraded = value)} />
            <ColorSourceControl name="grid-outage" label="Outage" source={themeConfiguration.grid.outage} automaticColor={theme.grid.outage} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.grid.outage = value)} />
            <ColorSourceControl name="grid-no-data" label="No data" source={themeConfiguration.grid.noData} automaticColor={theme.grid.noData} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.grid.noData = value)} />
          </div>
          <div class="override-group">
            <h3>Protocols</h3>
            <ColorSourceControl name="protocol-ipv4" label="IPv4" source={themeConfiguration.protocol.ipv4} automaticColor={theme.protocol.ipv4} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.protocol.ipv4 = value)} />
            <ColorSourceControl name="protocol-ipv6" label="IPv6" source={themeConfiguration.protocol.ipv6} automaticColor={theme.protocol.ipv6} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.protocol.ipv6 = value)} />
          </div>
          <div class="override-group">
            <h3>Gradients</h3>
            <ColorSourceControl name="headline-start" label="Headline top" source={themeConfiguration.headline.start} automaticColor={theme.headline.start} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.headline.start = value)} />
            <ColorSourceControl name="headline-end" label="Headline bottom" source={themeConfiguration.headline.end} automaticColor={theme.headline.end} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.headline.end = value)} />
            <ColorSourceControl name="blob-one" label="Blob one" source={themeConfiguration.background.blobs.colors[0]} automaticColor={theme.background.blobs.colors[0]} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.background.blobs.colors[0] = value)} />
            <ColorSourceControl name="blob-two" label="Blob two" source={themeConfiguration.background.blobs.colors[1]} automaticColor={theme.background.blobs.colors[1]} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.background.blobs.colors[1] = value)} />
          </div>
          <div class="override-group">
            <h3>Cards</h3>
            <ColorSourceControl name="card-background" label="Background" source={themeConfiguration.card.background} automaticColor={theme.card.background} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.card.background = value)} />
            <ColorSourceControl name="card-border" label="Border" source={themeConfiguration.card.border} automaticColor={theme.card.border} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.card.border = value)} />
            <ColorSourceControl name="card-separator" label="Separators" source={themeConfiguration.card.separator} automaticColor={theme.card.separator} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.card.separator = value)} />
            <ColorSourceControl name="service-icon" label="Service icon" source={themeConfiguration.service.icon} automaticColor={theme.service.icon} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.service.icon = value)} />
          </div>
          <div class="override-group">
            <h3>Text</h3>
            <ColorSourceControl name="text-primary" label="Primary" source={themeConfiguration.text.primary} automaticColor={theme.text.primary} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.text.primary = value)} />
            <ColorSourceControl name="text-secondary" label="Secondary" source={themeConfiguration.text.secondary} automaticColor={theme.text.secondary} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.text.secondary = value)} />
            <ColorSourceControl name="text-tertiary" label="Tertiary" source={themeConfiguration.text.tertiary} automaticColor={theme.text.tertiary} palette={themeConfiguration.palette} onChange={(value) => (themeConfiguration.text.tertiary = value)} />
          </div>
        </div>
      </ConfiguratorSection>
      </div>
      </div>

      <footer class="sidebar-footer">
        <button class="reset-button" type="button" onclick={resetAppearance}>
          <i class="ph-duotone ph-arrow-counter-clockwise" aria-hidden="true"></i>
          Reset appearance
        </button>
      </footer>
    </div>
  </aside>
</div>

<style>
  .configurator {
    --tool-bg: #101116;
    --tool-panel: #1b1d26;
    --tool-panel-raised: #272a36;
    --tool-input: #171922;
    --tool-line: #363a47;
    --tool-text: #efedf5;
    --tool-muted: #979aa8;
    --tool-faint: #6f7280;
    --tool-accent: #8ca5ff;
    --tool-error: #ff7e8c;
    --tool-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    min-height: 100vh;
    display: grid;
    grid-template-columns: minmax(720px, 1fr) auto;
    background: var(--tool-bg);
    color: var(--tool-text);
    font-family: "Avenir Next", Avenir, "Segoe UI", sans-serif;
  }
  .control-panel {
    position: relative;
    grid-column: 2;
    grid-row: 1;
    width: clamp(340px, calc(100vw - 720px), 390px);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-left: 1px solid var(--tool-line);
    background: var(--tool-panel);
    scrollbar-color: var(--tool-line) transparent;
    transition: width 160ms ease-in-out;
  }
  .control-panel.collapsed {
    width: 48px;
  }
  .sidebar-shell {
    width: clamp(340px, calc(100vw - 720px), 390px);
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    opacity: 1;
    visibility: visible;
    transition:
      opacity 120ms ease-in-out,
      visibility 0s;
  }
  .control-panel.collapsed .sidebar-shell {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 120ms ease-in-out,
      visibility 0s linear 120ms;
  }
  .sidebar-toggle {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--tool-accent);
    cursor: pointer;
    font: inherit;
  }
  .sidebar-header-toggle {
    position: absolute;
    top: 18px;
    right: 7px;
  }
  .sidebar-rail-toggle {
    position: absolute;
    top: 18px;
    right: 7px;
    z-index: 4;
  }
  .sidebar-toggle:hover {
    color: var(--tool-text);
  }
  .sidebar-toggle:focus-visible {
    outline: 2px solid var(--tool-accent);
    outline-offset: 2px;
  }
  .sidebar-toggle i {
    width: 22px;
    height: 22px;
    display: inline-block;
    font-size: 22px;
    line-height: 1;
    transition: transform 160ms ease-in-out;
  }
  .sidebar-toggle.expanded i {
    transform: rotate(180deg);
  }
  .control-scroll {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    overflow-anchor: none;
    scrollbar-color: var(--tool-line) transparent;
  }
  .tool-header {
    position: relative;
    padding: 28px 26px 24px;
    overflow: hidden;
    text-align: center;
  }
  .local-label {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 12px;
    color: var(--tool-muted);
    font-family: var(--tool-mono);
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .local-label span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #75d8b2;
    box-shadow: 0 0 0 4px rgba(117, 216, 178, 0.1);
  }
  h1 {
    --velvet-wordmark-size: 34px;

    width: max-content;
    display: grid;
    justify-items: center;
    gap: 5px;
    margin: 0 auto;
    color: var(--tool-accent);
  }
  .tool-subtitle {
    width: 96%;
    color: var(--tool-text);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.08em;
    line-height: 1;
    text-align: justify;
    text-align-last: justify;
    text-justify: inter-character;
    text-transform: uppercase;
  }
  .live-swatches {
    width: min(100%, 270px);
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    gap: 3px;
    height: 5px;
    margin: 20px auto 0;
  }
  .live-swatches span {
    transition: background 0.16s ease;
  }
  .file-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 18px 22px 10px;
  }
  .file-actions .primary {
    grid-column: 1 / -1;
  }
  .file-actions .save-as {
    grid-column: 1 / -1;
  }
  .button {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 8px 11px;
    border: 1px solid var(--tool-line);
    border-radius: 8px;
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    text-align: center;
  }
  .button i {
    font-size: 16px;
  }
  .button.secondary {
    background: var(--tool-panel-raised);
    color: var(--tool-text);
  }
  .button.primary {
    border-color: color-mix(in srgb, var(--tool-accent) 60%, var(--tool-line));
    background: var(--tool-accent);
    color: #10131c;
  }
  .button:hover {
    filter: brightness(1.08);
  }
  .button:focus-visible,
  .reset-button:focus-visible {
    outline: 2px solid var(--tool-accent);
    outline-offset: 2px;
  }
  .theme-status {
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 7px 22px 3px;
    color: var(--tool-text);
    font-size: 15px;
    font-weight: 650;
    text-align: center;
  }
  .theme-status strong {
    color: var(--tool-accent);
    font-size: 12px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .dirty-dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    background: var(--tool-accent);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--tool-accent) 14%, transparent);
  }
  .message {
    min-height: 38px;
    margin: 0 22px 10px;
    padding: 10px 12px;
    border-radius: 9px;
    background: var(--tool-panel-raised);
    text-align: center;
  }
  .message p {
    margin: 0;
    color: var(--tool-muted);
    font-size: 13px;
    line-height: 1.45;
  }
  .message .error {
    margin-top: 4px;
    color: var(--tool-error);
  }
  .section-toolbar {
    display: flex;
    justify-content: flex-end;
    padding: 11px 22px 0;
  }
  .section-toolbar button {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 7px;
    padding: 5px 0;
    border: 0;
    background: transparent;
    color: var(--tool-muted);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
  }
  .section-toolbar button:hover {
    color: var(--tool-text);
  }
  .section-toolbar button:focus-visible {
    border-radius: 4px;
    outline: 2px solid var(--tool-accent);
    outline-offset: 3px;
  }
  .section-toolbar i {
    width: 22px;
    height: 22px;
    display: inline-block;
    flex: none;
    color: var(--tool-accent);
    font-size: 22px;
    line-height: 1;
    transition: transform 160ms ease-in-out;
  }
  .section-toolbar i.expanded {
    transform: rotate(180deg);
  }
  .control-sections {
    padding: 0 22px;
  }
  .section-help {
    margin: 5px 0 13px;
    color: var(--tool-muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .color-list {
    display: grid;
    gap: 12px;
    margin-top: 14px;
  }
  .text-control {
    display: grid;
    gap: 7px;
    margin-top: 14px;
    color: var(--tool-text);
    font-size: 14px;
    font-weight: 550;
  }
  .text-control input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--tool-line);
    border-radius: 8px;
    outline: none;
    background: var(--tool-input);
    color: var(--tool-text);
    font: inherit;
    font-size: 14px;
  }
  .text-control input:focus-visible {
    border-color: var(--tool-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--tool-accent) 22%, transparent);
  }
  .override-groups,
  .override-group {
    display: grid;
  }
  .override-groups {
    gap: 22px;
  }
  .override-group {
    gap: 12px;
  }
  .override-group h3 {
    margin: 0;
    padding-bottom: 7px;
    border-bottom: 1px solid var(--tool-line);
    color: var(--tool-muted);
    font-family: var(--tool-mono);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .segmented {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
    padding: 3px;
    border: 1px solid var(--tool-line);
    border-radius: 9px;
    background: var(--tool-input);
  }
  .segmented label {
    cursor: pointer;
  }
  .segmented input {
    position: absolute;
    opacity: 0;
  }
  .segmented span {
    display: block;
    padding: 7px 8px;
    border-radius: 6px;
    color: var(--tool-muted);
    font-size: 14px;
    font-weight: 600;
    text-align: center;
  }
  .segmented input:checked + span {
    background: var(--tool-panel-raised);
    color: var(--tool-text);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.24);
  }
  .segmented input:focus-visible + span {
    outline: 2px solid var(--tool-accent);
  }
  .line-style-control + .line-style-control {
    margin-top: 14px;
  }
  .line-style-control > span {
    display: block;
    margin-bottom: 7px;
    color: var(--tool-muted);
    font-size: 13px;
  }
  .line-styles {
    grid-template-columns: repeat(3, 1fr);
  }
  .line-styles span {
    text-transform: capitalize;
  }
  .background-gradient {
    display: grid;
    gap: 12px;
  }
  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 12px;
  }
  .switch-row strong,
  .switch-row span {
    display: block;
  }
  .switch-row strong {
    color: var(--tool-text);
    font-size: 14px;
  }
  .switch-row div > span {
    margin-top: 2px;
    color: var(--tool-muted);
    font-size: 12px;
  }
  .switch {
    position: relative;
    flex: 0 0 auto;
    cursor: pointer;
  }
  .switch input {
    position: absolute;
    opacity: 0;
  }
  .switch > span[aria-hidden="true"] {
    width: 38px;
    height: 22px;
    display: block;
    padding: 3px;
    border: 1px solid var(--tool-line);
    border-radius: 999px;
    background: var(--tool-input);
  }
  .switch > span[aria-hidden="true"]::after {
    content: "";
    width: 14px;
    height: 14px;
    display: block;
    border-radius: 50%;
    background: var(--tool-faint);
    transition:
      transform 0.14s ease,
      background 0.14s ease;
  }
  .switch input:checked + span {
    border-color: color-mix(in srgb, var(--tool-accent) 55%, var(--tool-line));
    background: color-mix(in srgb, var(--tool-accent) 16%, var(--tool-input));
  }
  .switch input:checked + span::after {
    transform: translateX(16px);
    background: var(--tool-accent);
  }
  .switch input:focus-visible + span {
    outline: 2px solid var(--tool-accent);
    outline-offset: 2px;
  }
  .sidebar-footer {
    position: sticky;
    bottom: 0;
    z-index: 2;
    flex: none;
    padding: 10px 22px 14px;
    border-top: 1px solid var(--tool-line);
    background: color-mix(in srgb, var(--tool-panel) 94%, transparent);
    box-shadow: 0 -12px 24px rgba(0, 0, 0, 0.14);
    backdrop-filter: blur(12px);
  }
  .reset-button {
    width: auto;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 8px 14px;
    border: 1px solid var(--tool-line);
    border-radius: 999px;
    background: var(--tool-panel-raised);
    color: var(--tool-text);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
  }
  .sidebar-footer {
    display: flex;
    justify-content: center;
  }
  .preview-workspace {
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
    padding: 22px;
    overflow: auto;
    background-color: var(--background-end);
    background-image:
      var(--cloudy-blobs),
      linear-gradient(
        180deg,
        var(--background-start) 0%,
        var(--background-end) 100%
      );
    background-repeat: no-repeat;
    color: var(--text);
    font-family: var(--font-sans);
  }
  .preview-header {
    min-width: 720px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    max-width: 980px;
    margin: 0 auto 12px;
    color: var(--tool-muted);
  }
  .preview-header div > span,
  .preview-header strong {
    display: block;
  }
  .preview-header div > span {
    font-family: var(--tool-mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .preview-header strong {
    margin-top: 3px;
    color: var(--tool-text);
    font-size: 12px;
  }
  .preview-size {
    padding: 5px 8px;
    border: 1px solid var(--tool-line);
    border-radius: 6px;
    font-family: var(--tool-mono);
    font-size: 10px;
  }
  .preview-surface {
    min-width: 720px;
    width: 100%;
    overflow: hidden;
    min-height: calc(100vh - 78px);
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (min-width: 1101px) {
    .configurator {
      height: 100vh;
      min-height: 0;
      overflow: hidden;
    }
    .preview-workspace {
      height: 100vh;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .preview-header {
      width: 100%;
      flex: none;
    }
    .preview-surface {
      --status-page-min-height: 100%;

      flex: 1 1 0;
      min-height: 0;
      overflow: visible;
    }
  }

  @media (max-width: 1100px) {
    .configurator {
      grid-template-columns: 1fr;
    }
    .control-panel {
      grid-column: 1;
      grid-row: 1;
      width: 100%;
      height: auto;
      max-height: none;
      border-left: 0;
      border-bottom: 1px solid var(--tool-line);
    }
    .control-panel.collapsed {
      width: 100%;
    }
    .sidebar-shell,
    .control-panel.collapsed .sidebar-shell {
      width: 100%;
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }
    .sidebar-toggle {
      display: none;
    }
    .control-scroll {
      overflow: visible;
    }
    .preview-workspace {
      grid-column: 1;
      grid-row: 2;
    }
    .control-sections {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 28px;
    }
  }

  @media (max-width: 680px) {
    .control-sections {
      grid-template-columns: 1fr;
    }
    .preview-workspace {
      padding: 16px 0;
    }
    .preview-header {
      padding: 0 16px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .live-swatches span,
    .switch > span[aria-hidden="true"]::after,
    .control-panel,
    .sidebar-shell,
    .sidebar-toggle i,
    .section-toolbar i {
      transition: none;
    }
  }
</style>
