import { MANAGED_TEMPLATE_PATHS } from "@velvet/contracts";

/**
 * Branch that stores the generated Velvet status history.
 *
 * The monitor owns this branch exclusively and rewrites it on its own schedule,
 * including elder-history compaction that replaces the branch with an unrelated
 * root commit. Managed updates therefore never read, write, or compare its
 * commits; they only prove that an update never targets or removes it.
 */
export const VELVET_DATA_BRANCH = "velvet-data";

const MANAGED_PATHS = new Set<string>(MANAGED_TEMPLATE_PATHS);

/**
 * Decides whether a branch name belongs to protected user state and must never
 * become the target of a managed update.
 *
 * @param name - Branch name without the `refs/heads/` prefix.
 * @returns `true` when updating the branch would rewrite protected data.
 */
export function isProtectedBranch(name: string): boolean {
  return name === VELVET_DATA_BRANCH;
}

/**
 * Filters a change set down to the paths a managed update must never touch.
 *
 * Ownership is decided by exact match against the closed Velvet-owned file set,
 * so a path that merely resembles a managed file, such as a copy in another
 * directory or a differently spelled variant, counts as protected user content.
 *
 * @param paths - Repository-relative paths a change set adds, edits, renames,
 *   or deletes. Both sides of a rename must be supplied.
 * @returns The protected paths in their original order, empty when the change
 *   set stays inside the Velvet-owned file set.
 */
export function protectedChangedPaths(paths: readonly string[]): string[] {
  return paths.filter((path) => !MANAGED_PATHS.has(path));
}
