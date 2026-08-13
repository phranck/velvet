/**
 * Hands a file to the browser's own download, for a page that cannot write one.
 *
 * The File System Access API is what the Configurator uses where it exists,
 * because that writes back to the file somebody opened. Where it does not, this
 * is the whole of what a page may do: construct the file in memory, point an
 * anchor at it, and click it.
 *
 * The object URL holds the blob alive until it is revoked, and the revoke is
 * deferred to the next turn because the click has not been handled yet when
 * this function returns.
 *
 * @param filename - The name to offer, which the browser may still change.
 * @param contents - What the file holds.
 * @param type - The media type, which decides what a browser offers to open it
 *   with.
 */
export function downloadFile(
  filename: string,
  contents: string,
  type: string,
): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
