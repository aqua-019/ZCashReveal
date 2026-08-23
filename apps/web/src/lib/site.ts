/**
 * The site's own address, in one place.
 *
 * Used by the citation apparatus, the RSS feed and the JSON exports, all three
 * of which have to emit absolute URLs: a citation that resolves only relative
 * to the page it was copied from is not a citation, and an RSS reader has no
 * page to resolve against at all.
 *
 * It matches `metadataBase` in src/app/layout.tsx deliberately. When a custom
 * domain arrives (HANDOFF-11), both change together and the unit test that
 * compares them fails if only one does.
 */
export const SITE_URL = "https://zecreveal.vercel.app";

/** Absolute form of a site-relative path. */
export function absolute(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
