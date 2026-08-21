<script lang="ts">
  import { Avatar, DropdownMenu } from "bits-ui";

  interface Props {
    /** The GitHub account this browser is signed in as. */
    login: string;
    /** That account's picture on GitHub. */
    avatarUrl: string;
    /** What the account calls itself, where it has set a name at all. */
    name?: string;
    /** The account's public address on GitHub, where it has published one. */
    email?: string;
    /** Ends the session and starts a new authorization. */
    onSwitchAccount: () => void;
    /** Ends the session and leaves the tool. */
    onSignOut: () => void;
  }

  const { login, avatarUrl, name, email, onSwitchAccount, onSignOut }: Props =
    $props();

  /** What the menu calls this account, which is the name where there is one. */
  const shown = $derived(name ?? login);

  /**
   * What stands in for the picture until it has loaded, or when it will not.
   *
   * The first letter of what the menu itself shows, so the mark and the name
   * beside it never name different accounts.
   */
  const initial = $derived(shown.trim().slice(0, 1).toUpperCase());
</script>

<!--
  The account stands at the foot of the rail, which is the one part of the
  frame that is there whether the sidebar is or not. It is a picture rather
  than a name because the rail is one icon wide, and the name is in the menu
  the picture opens.
-->
<div class="account">
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      class="account__trigger"
      aria-label="Account, signed in as {shown}"
    >
      <Avatar.Root class="account__avatar" delayMs={0}>
        <!--
          Empty alt: the button around it already says whose account this is,
          and a screen reader announcing the name twice reads as two controls.
        -->
        <Avatar.Image src={avatarUrl} alt="" class="account__image" />
        <Avatar.Fallback class="account__initial">{initial}</Avatar.Fallback>
      </Avatar.Root>
    </DropdownMenu.Trigger>

    <DropdownMenu.Portal>
      <!--
        Out to the side and aligned with the foot, because the trigger sits at
        the bottom of a column-high rail and a menu below it would leave the
        window.
      -->
      <DropdownMenu.Content
        class="account__menu"
        side="right"
        align="end"
        sideOffset={10}
        collisionPadding={12}
      >
        <!--
          The picture again, larger, standing beside everything else rather
          than above it: it names the session the whole menu belongs to, so it
          is a column of its own and not the first row of one.
        -->
        <Avatar.Root
          class="account__avatar account__avatar--large"
          delayMs={0}
        >
          <Avatar.Image src={avatarUrl} alt="" class="account__image" />
          <Avatar.Fallback class="account__initial">{initial}</Avatar.Fallback>
        </Avatar.Root>

        <div class="account__body">
          <DropdownMenu.Group>
            <!--
              Who this is. It says rather than does, so it is a heading rather
              than an item. The address is left out entirely where GitHub gives
              none, which is the usual case.
            -->
            <DropdownMenu.GroupHeading class="account__identity">
              <span class="account__name">{shown}</span>
              {#if email}
                <span class="account__email">{email}</span>
              {/if}
            </DropdownMenu.GroupHeading>
            <DropdownMenu.Separator class="account__rule" />
            <!--
              Both items end this session. They differ in where the browser
              goes afterwards, because GitHub decides which account answers an
              authorization and neither of these can ask it to offer a choice.
            -->
            <DropdownMenu.Item class="account__item" onSelect={onSwitchAccount}>
              Sign in as somebody else…
            </DropdownMenu.Item>
            <DropdownMenu.Item class="account__item" onSelect={onSignOut}>
              Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Group>
        </div>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
</div>

<style>
  /* The trigger's own box, so the rail places one element rather than a
     component's root. */
  .account {
    display: flex;
  }

  /* The picture alone, with no border and no surface behind it, which is what
     the rail's other control does too. */
  :global(.account__trigger) {
    display: block;
    padding: 0;
    border: none;
    background: none;
    border-radius: 50%;
    cursor: pointer;
  }

  :global(.account__trigger:focus-visible) {
    outline: 2px solid var(--configurator-accent-lit);
    outline-offset: 2px;
  }

  /* Round, and the width of the rail's own glyph, so the foot of the rail
     reads as the same column as its head. */
  :global(.account__avatar) {
    display: block;
    flex: 0 0 auto;
    width: var(--configurator-glyph-large);
    height: var(--configurator-glyph-large);
    border-radius: 50%;
    overflow: hidden;
  }

  /* In the menu there is room for it to be read as a face rather than as a
     mark, so it is stated at the larger size instead. */
  :global(.account__avatar--large) {
    width: var(--configurator-avatar-large);
    height: var(--configurator-avatar-large);
  }

  :global(.account__image) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* What shows whilst the picture is on its way, and instead of it where it
     never arrives. */
  :global(.account__initial) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: var(--configurator-raised);
    color: var(--configurator-text-muted);
    font-family: var(--configurator-font-label);
    font-size: var(--configurator-text-label-small);
    line-height: 1;
  }

  /* Global, because bits-ui renders the menu into a portal at the end of the
     document, so Svelte's scoping attribute never reaches it. */
  :global(.account__menu) {
    display: flex;
    align-items: center;
    gap: var(--configurator-inset);
    min-width: 20rem;
    padding: var(--configurator-inset);
    border: 1px solid var(--configurator-divider);
    /* A surface standing on the page rather than nested in one, so it carries
       the stated radius and what it holds carries the derived one. All three
       sit together because a derivation resolves where it is declared. */
    border-radius: var(--configurator-radius);
    --configurator-radius-inner: max(
      calc(var(--configurator-radius) - var(--configurator-inset)),
      0px
    );
    --configurator-text-inset: calc(var(--configurator-radius) / 2);
    background: var(--configurator-raised);
    box-shadow: 0 1rem 2.5rem
      color-mix(in srgb, var(--configurator-sunken) 70%, transparent);
    z-index: 20;
  }

  /* Everything the picture stands beside: who this is, and what can be done
     about it. */
  :global(.account__body) {
    flex: 1;
    min-width: 0;
  }

  /* The two lines naming the account, standing in by half the radius because
     a line flush against a curve reads as colliding with it. */
  :global(.account__identity) {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-inline: var(--configurator-text-inset);
    padding-block: 0.125rem 0.625rem;
  }

  :global(.account__name) {
    min-width: 0;
    color: var(--configurator-text);
    font-family: var(--configurator-font-label);
    font-size: var(--configurator-text-label);
    letter-spacing: var(--configurator-tracking-label);
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Set plainly rather than as a label: an address is read as itself, and
     tracked capitals would make it something to decipher. */
  :global(.account__email) {
    min-width: 0;
    color: var(--configurator-text-muted);
    font-family: var(--configurator-font);
    font-size: var(--configurator-text-small);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Runs the full width of the column, so it takes no text inset. */
  :global(.account__rule) {
    height: 1px;
    margin-block: 0 0.5rem;
    background: var(--configurator-divider);
  }

  :global(.account__item) {
    display: block;
    width: 100%;
    padding: 0.45rem var(--configurator-text-inset);
    border-radius: var(--configurator-radius-inner);
    color: var(--configurator-text);
    font-family: var(--configurator-font);
    font-size: var(--configurator-text-small);
    text-align: left;
    cursor: pointer;
  }

  /* bits-ui marks whichever item the arrow keys are on, and the pointer answers
     for itself, so both are named rather than relying on the one to cover the
     other. It arrives at once and leaves at once: an item that fades under the
     pointer reads as lagging behind it. */
  :global(.account__item:hover),
  :global(.account__item[data-highlighted]) {
    background: var(--configurator-accent-surface);
    color: var(--configurator-accent-lit);
    outline: none;
  }
</style>
