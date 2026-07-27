<script lang="ts">
  import CustomListbox from "./CustomListbox.svelte";
  import type { RegistryTheme } from "./theme-registry";

  let {
    themes,
    selectedId,
    currentName,
    currentPalette,
    modified,
    onSelect,
  }: {
    themes: RegistryTheme[];
    selectedId: string | null;
    currentName: string;
    currentPalette: RegistryTheme["theme"]["palette"];
    modified: boolean;
    onSelect: (theme: RegistryTheme) => void;
  } = $props();

  const selected = $derived(themes.find(({ id }) => id === selectedId));
  const visiblePalette = $derived(selected?.theme.palette ?? currentPalette);
  const options = $derived(
    themes.map((theme) => ({
      value: theme.id,
      label: theme.name,
      description: theme.author ? `by ${theme.author}` : undefined,
      swatches: Object.values(theme.theme.palette),
    })),
  );

  function choose(id: string): void {
    const theme = themes.find((entry) => entry.id === id);
    if (theme) onSelect(theme);
  }
</script>

<div class="theme-picker" data-theme-picker>
  <CustomListbox
    id="theme-registry"
    ariaLabel="Community themes"
    value={selectedId ?? ""}
    {options}
    displayLabel={selected?.name ?? currentName}
    displayDescription={modified ? "Modified" : selected?.author ? `by ${selected.author}` : undefined}
    displaySwatches={Object.values(visiblePalette)}
    onChange={choose}
  />
</div>

<style>
  .theme-picker {
    position: relative;
  }
</style>
