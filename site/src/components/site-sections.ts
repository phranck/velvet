/**
 * The pages velvet.li offers besides the start page.
 *
 * Stated once, because two surfaces lead to them: the bar at the top of every
 * page and the row at the foot of it. Written out in both, a page renamed or
 * moved would reach one of them and the other would go on pointing at where it
 * used to be.
 *
 * Neither surface offers all of them. Each names what it leads to, so no page
 * is offered twice within one screen and neither list changes because the other
 * one was reordered.
 */

/** One page the site leads to. */
export interface SiteSection {
  /** What the bar marks as current, and what the foot picks by. */
  readonly id: "documentation" | "changelog" | "references" | "attributions";
  readonly label: string;
  readonly href: string;
}

/**
 * Every page the site leads to, in the order they were built.
 *
 * The labels carry no icons. They are set in the label face at a size where an
 * icon beside them would be the larger of the two, and an uppercase word reads
 * as a thing of its own without anything pointing at it.
 */
export const SITE_SECTIONS: readonly SiteSection[] = [
  { id: "documentation", label: "Documentation", href: "/documentation" },
  { id: "changelog", label: "Changelog", href: "/changelog" },
  { id: "references", label: "References", href: "/references" },
  { id: "attributions", label: "Attributions", href: "/attributions" },
];

/**
 * Picks pages by name, in the order they are named.
 *
 * Both surfaces carry fewer than the list holds and in their own order, so each
 * says which ones rather than taking a slice of the list above and depending on
 * that order staying as it is.
 *
 * @param wanted - The pages to take, by identifier.
 * @returns Those pages, in the order asked for.
 */
export function sectionsNamed(
  ...wanted: readonly SiteSection["id"][]
): readonly SiteSection[] {
  return wanted.map((id) => {
    const section = SITE_SECTIONS.find((candidate) => candidate.id === id);
    if (!section) throw new Error(`velvet: no site section called "${id}"`);
    return section;
  });
}
