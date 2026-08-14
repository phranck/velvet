/**
 * How large the pieces of a setup request may be.
 *
 * Stated here because both ends need the same numbers. The browser refuses an
 * oversized file at the field, where the person who chose it is still looking
 * at it, and the service refuses an oversized body at the door. Two separately
 * written figures drift, and the direction they drift in decides whether
 * somebody is told plainly or watches setup fail for no stated reason.
 */

/**
 * The largest setup request body the service reads.
 *
 * A bound on how much memory a caller can ask the service to allocate, so it
 * covers the whole body rather than any one field within it.
 */
export const MAX_SETUP_REQUEST_BYTES = 256 * 1_024;

/**
 * What the rest of a setup request is allowed to weigh beside the logo.
 *
 * The configuration grows with the number of services, their headers, and
 * their assertions, so this is generous rather than measured against one
 * example.
 */
const SETUP_CONFIGURATION_HEADROOM_BYTES = 32 * 1_024;

/**
 * The largest logo file somebody may choose, in bytes of the file itself.
 *
 * Derived rather than stated, because the file travels as base64 and base64 is
 * a third larger than what it encodes. A limit written directly in file bytes
 * is written in the wrong units, and a figure above the request bound produces
 * a file the browser accepts and the service then refuses.
 */
export const MAX_SETUP_LOGO_BYTES = Math.floor(
  ((MAX_SETUP_REQUEST_BYTES - SETUP_CONFIGURATION_HEADROOM_BYTES) * 3) / 4,
);

/** What {@link MAX_SETUP_LOGO_BYTES} becomes once encoded. */
export const MAX_SETUP_LOGO_BASE64_BYTES = Math.ceil(
  (MAX_SETUP_LOGO_BYTES * 4) / 3,
);

/**
 * The most installations one listing reports.
 *
 * Reading a repository's lock file is one request each, and the listing is
 * interactive, so it stops here and says that it did rather than spending the
 * user's rate limit on a large account. The service holds itself to this
 * number and the contract holds the answer to it, so a listing that grew past
 * what the browser is willing to read cannot arrive unnoticed.
 */
export const MAX_MANAGEABLE_INSTALLATIONS = 60;
