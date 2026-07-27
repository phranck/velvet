const COMBINING_MARKS = /\p{Mark}+/gu;
const UNSAFE_FILENAME_CHARACTERS = /[^\p{Letter}\p{Number}]+/gu;
const EDGE_HYPHENS = /^-+|-+$/g;

export function themeConfigurationFilename(themeName: string): string {
  const slug = themeName
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(UNSAFE_FILENAME_CHARACTERS, "-")
    .replace(EDGE_HYPHENS, "");

  return `${slug || "velvet-theme"}.yml`;
}
