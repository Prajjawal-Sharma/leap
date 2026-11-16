// Where an uploaded résumé PDF lives in the private `resumes` bucket, and the
// test for whether a stored path belongs to a user.
//
// The ownership test is a grammar, not a prefix check. The storage client
// puts the path into the request URL as it stands, and fetch resolves dot
// segments, so "<me>/../<victim>/cv.pdf" starts with "<me>/" and still
// downloads the victim's object; "%2e%2e" and a backslash resolve the same
// way. Every segment therefore has to be plain — letters, digits, ".", "_"
// and "-", never starting with a dot. Migration 0008 enforces the same shape
// in resumes_storage_path_owner_check; change the two together.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SEGMENT_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
const MAX_NAME_CHARS = 120;

/** The uploaded file's name reduced to characters a path segment may hold. */
export function safeFileName(name: string): string {
  return (
    name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, MAX_NAME_CHARS) ||
    "resume.pdf"
  );
}

/**
 * `<user id>/<epoch ms>-<safe name>`. The timestamp keeps the segment from
 * ever being "." or "..", whatever the file was called.
 */
export function buildStoragePath(
  userId: string,
  fileName: string,
  now: number
): string {
  return `${userId}/${now}-${safeFileName(fileName)}`;
}

/**
 * True only for a path inside `userId`'s own folder that cannot resolve to
 * anywhere else. `userId` must be the lower-case uuid Supabase issues, which
 * is also how Postgres prints the `user_id` column the constraint compares
 * against.
 */
export function isOwnStoragePath(path: unknown, userId: string): path is string {
  if (typeof path !== "string" || !UUID_RE.test(userId)) return false;
  const prefix = `${userId}/`;
  if (!path.startsWith(prefix)) return false;
  return path
    .slice(prefix.length)
    .split("/")
    .every((segment) => SEGMENT_RE.test(segment));
}
