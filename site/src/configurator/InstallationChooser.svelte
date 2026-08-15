<script lang="ts">
  import { RadioGroup } from "bits-ui";

  import type { ManageableInstallation } from "@velvet/contracts";

  interface Props {
    installations: ManageableInstallation[];
    /** Whether the listing stopped at its own limit with more to find. */
    truncated: boolean;
    /** The chosen repository, as the string a radio group carries. */
    value: string;
    onChoose: (value: string) => void;
  }

  const { installations, truncated, value, onChoose }: Props = $props();
</script>

{#if truncated}
  <p class="note">
    This is not the whole list. The search stopped at its own limit, so an
    installation you expect may be missing rather than absent.
  </p>
{/if}
<RadioGroup.Root
  class="chooser"
  {value}
  onValueChange={onChoose}
  aria-label="Velvet installations you may configure"
>
  {#each installations as installation (installation.repositoryId)}
    <RadioGroup.Item
      class="chooser__item"
      value={String(installation.repositoryId)}
    >
      <span class="chooser__name">
        {installation.owner}/{installation.name}
      </span>
      <span class="chooser__aside">Velvet {installation.installedVersion}</span>
    </RadioGroup.Item>
  {/each}
</RadioGroup.Root>

<style>
  .note {
    margin: 0 0 0.5rem;
    color: var(--configurator-edge);
    font-size: var(--configurator-text-small);
    line-height: 1.5;
  }
</style>
