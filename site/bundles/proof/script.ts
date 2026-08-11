/**
 * What this design does once its markup is on the page.
 *
 * It is handed the element the template's markup was put into, and the same
 * data the template rendered from. It fetches nothing: everything a range
 * change needs is already in the object it was given, which is the point of the
 * host loading the data rather than the design.
 *
 * It uses one plugin, the disclosure, and does its own arithmetic. That pairing
 * is deliberate: a bundle may borrow what is worth borrowing and still owe
 * nothing for the rest.
 *
 * Whatever it returns is called when the page goes away, so a preview frame can
 * swap one design for another without leaving listeners behind.
 */

import { disclosure } from "@velvet/bundle-plugins/disclosure";

import type { BundleData } from "../../src/lib/bundles/data.js";
import { uptimeFor } from "./uptime.js";

/**
 * Wires the range buttons and the disclosure on every service.
 *
 * @param root - The element the markup was rendered into.
 * @param data - The status data the host handed over.
 * @returns The function that undoes everything this attached.
 */
export function enhance(root: HTMLElement, data: BundleData): () => void {
  const page = root.querySelector<HTMLElement>(".proof-page") ?? root;
  const ranges = [...page.querySelectorAll<HTMLButtonElement>(".proof-range")];
  const summaries = [
    ...page.querySelectorAll<HTMLButtonElement>(".proof-summary"),
  ];
  const undo: Array<() => void> = [];

  /** Rewrites every figure for the range a visitor picked. */
  function selectRange(next: string): void {
    page.dataset.range = next;
    for (const button of ranges) {
      button.setAttribute("aria-pressed", String(button.dataset.range === next));
    }
    for (const figure of page.querySelectorAll<HTMLElement>("[data-uptime-for]")) {
      const id = figure.dataset.uptimeFor;
      if (!id) continue;
      figure.textContent = `${uptimeFor(data, id, next)} uptime`;
    }
  }

  for (const button of ranges) {
    const onClick = (): void => selectRange(button.dataset.range ?? "month");
    button.addEventListener("click", onClick);
    undo.push(() => button.removeEventListener("click", onClick));
  }

  for (const summary of summaries) {
    const detailsId = summary.getAttribute("aria-controls");
    const details = detailsId
      ? page.querySelector<HTMLElement>(`#${CSS.escape(detailsId)}`)
      : null;
    if (!details) continue;
    // The panel animates its own height, so everything under it is carried
    // along by ordinary layout rather than by anything this has to move.
    const panel = disclosure(details, false);
    let open = false;
    const onClick = (): void => {
      open = !open;
      summary.setAttribute("aria-expanded", String(open));
      panel.update(open);
    };
    summary.addEventListener("click", onClick);
    undo.push(() => {
      summary.removeEventListener("click", onClick);
      panel.destroy();
    });
  }

  return () => {
    for (const step of undo) step();
  };
}

export default enhance;
