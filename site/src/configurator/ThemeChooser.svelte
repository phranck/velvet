<script lang="ts">
  import { RadioGroup } from "bits-ui";

  import { OFFERED_THEMES } from "../lib/themes/catalogue.js";

  interface Props {
    /** The theme being shown, as its directory name. */
    value: string;
    onChoose: (value: string) => void;
  }

  const { value, onChoose }: Props = $props();
</script>

<RadioGroup.Root
  class="chooser"
  {value}
  onValueChange={onChoose}
  aria-label="Themes this page can be published in"
>
  {#each OFFERED_THEMES as theme (theme.id)}
    <RadioGroup.Item class="chooser__item" value={theme.id}>
      <span class="chooser__name">{theme.name}</span>
      <span class="chooser__aside">{theme.era}</span>
    </RadioGroup.Item>
  {/each}
</RadioGroup.Root>
