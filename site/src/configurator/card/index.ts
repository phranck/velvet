/**
 * The configurator's card, as its parts.
 *
 * Imported whole and used by name, so what a card is made of reads in the
 * markup that builds one:
 *
 * ```svelte
 * <Card.Root>
 *   <Card.Header>
 *     <h2>Choose a theme</h2>
 *     <Card.Addon><button type="button">Close</button></Card.Addon>
 *   </Card.Header>
 *   <Card.Body>…</Card.Body>
 *   <Card.Footer>…</Card.Footer>
 * </Card.Root>
 * ```
 *
 * Every part but the root is optional, and each is brought by the caller
 * rather than switched on. That is what keeps a card from growing a flag every
 * time somebody wants one without a footer.
 */
export { default as Root } from "./CardRoot.svelte";
export { default as Header } from "./CardHeader.svelte";
export { default as Addon } from "./CardAddon.svelte";
export { default as Body } from "./CardBody.svelte";
export { default as Footer } from "./CardFooter.svelte";
