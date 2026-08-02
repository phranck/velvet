<script lang="ts">
  /**
   * Marks a field the step will not let you past whilst it is empty.
   *
   * Purely visual. The mark carries no accessible name of its own, because
   * assistive technology is told the same thing by the field's own `required`
   * attribute, and hearing it twice for one field is worse than hearing it
   * once. Anything wearing this must be a field the step check actually
   * rejects, or the mark teaches a rule the form does not keep.
   */
</script>

<i class="required-mark ph-duotone ph-seal-warning" aria-hidden="true"></i>

<style>
  .required-mark {
    margin-left: 0.3rem;
    color: var(--required-mark-color, currentColor);
    font-size: var(--required-mark-size, 1em);
    vertical-align: -0.1em;
  }
</style>
