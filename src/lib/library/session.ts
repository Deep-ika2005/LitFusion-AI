import type { Session } from "next-auth";

export interface LibraryIdentity {
  /** Stable per-account storage key. Never changes for the same login. */
  key: string;
  email: string | null;
}

const LEGACY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the caller's library identity from a NextAuth session.
 *
 * The storage key must be identical on every sign-in for the same account.
 * Preferred order:
 *   1. namespaced stable id from the `jwt`/`session` callbacks
 *      (`google:<providerAccountId>` or `email:<address>`);
 *   2. a bare numeric Google subject (older sessions) -> `google:<sub>`;
 *   3. a bare email address -> `email:<address>`;
 *   4. a legacy random-UUID `token.sub` (pre-fix sessions still holding a
 *      valid JWT cookie) -> the verified email bucket, so the library keeps
 *      working even before the user re-authenticates and the stored orphans
 *      can be adopted by the migration in `store.ts`.
 */
export function getLibraryIdentity(session: Session | null): LibraryIdentity | null {
  const user = session?.user as { id?: string; email?: string | null } | undefined;
  const rawId = user?.id?.trim() || null;
  const email = user?.email?.trim().toLowerCase() || null;

  let key: string | null = null;
  if (rawId && rawId.includes(":")) {
    key = rawId;
  } else if (rawId && rawId.includes("@")) {
    key = `email:${rawId.toLowerCase()}`;
  } else if (rawId && LEGACY_UUID_RE.test(rawId)) {
    // Pre-fix session: `token.sub` was a fresh random UUID per sign-in and
    // can never address a stable bucket. Fall through to the email bucket.
    key = email ? `email:${email}` : rawId;
  } else if (rawId) {
    key = `google:${rawId}`;
  } else if (email) {
    key = `email:${email}`;
  }

  if (!key) return null;
  return { key, email };
}
