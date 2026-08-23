/**
 * The response boundary: validate against the DTO, then make it JSON.
 *
 * HANDOFF-05 section 3: "All responses validated against the Zod DTOs before
 * sending." Not typed against - VALIDATED. The gateway builds these objects by
 * hand from three sources that know nothing about each other (a node, a
 * Postgres cache, a content package), and a field that is quietly absent is
 * exactly the failure `apps/web`'s `HttpApi` was written to catch at the other
 * end. Catching it here means the gateway names the field; catching it there
 * means a page renders a gap.
 *
 * ORDER MATTERS AND IS NOT INTERCHANGEABLE:
 *
 *   1. build the DTO with `bigint` zatoshi, because that is what CLAUDE.md
 *      fixes and what the arithmetic used;
 *   2. `schema.parse` it, which also normalises - `zatSchema` accepts a bigint
 *      or a decimal string and yields a bigint either way;
 *   3. convert every bigint to a decimal STRING, because JSON has no bigint and
 *      `JSON.stringify` throws on one rather than degrading.
 *
 * The client then parses those strings straight back to bigint through the same
 * schema. So a zatoshi crosses the wire as an exact decimal string and is never
 * a double at either end, which is the whole reason this project counts in
 * zatoshi at all.
 */
import type { z } from "zod";

/** JSON with no bigint left in it. */
export type JsonSafe =
  | string
  | number
  | boolean
  | null
  | JsonSafe[]
  | { [key: string]: JsonSafe };

/**
 * Recursively replace every bigint with its decimal string.
 *
 * `undefined` properties are dropped rather than serialised as null: an absent
 * optional field and a field that is present and null mean different things in
 * every DTO here, and `JSON.stringify` would already drop the first - doing it
 * here as well means the value this function returns is what the client will
 * actually receive, which matters because assertion A7 greps THIS value.
 */
export function toJsonSafe(value: unknown): JsonSafe {
  if (typeof value === "bigint") return value.toString();
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out: Record<string, JsonSafe> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = toJsonSafe(v);
    }
    return out;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  // Symbols and functions cannot appear in a DTO; if one does, that is a defect
  // and it should be loud rather than serialised as null.
  throw new TypeError(`toJsonSafe: cannot serialise a ${typeof value}`);
}

/** A DTO that failed its own schema on the way out. Always a gateway defect, never a client's. */
export class DtoViolation extends Error {
  constructor(
    readonly route: string,
    readonly issues: readonly { path: string; message: string }[],
  ) {
    const first = issues[0];
    super(
      `${route} built a response that does not satisfy its own DTO: ${
        first === undefined ? "no issue reported" : `${first.path} - ${first.message}`
      }`,
    );
    this.name = "DtoViolation";
  }
}

/**
 * Validate a built DTO and return it ready to send.
 *
 * Throws `DtoViolation` on failure, which the error handler turns into a 500.
 * That is the correct status and it is worth being explicit about why: the
 * request was fine, the gateway's own output was not, and reporting a 4xx would
 * blame the caller for the gateway's defect.
 */
export function respond<T>(route: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, dto: unknown): JsonSafe {
  const parsed = schema.safeParse(dto);
  if (!parsed.success) {
    throw new DtoViolation(
      route,
      parsed.error.issues.map((i) => ({ path: i.path.join(".") || "(root)", message: i.message })),
    );
  }
  return toJsonSafe(parsed.data);
}
