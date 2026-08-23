"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { IconSearch } from "@/components/icons";
import { hrefFor, KIND_TEXT, searchKind } from "@/lib/api/kind";

/**
 * The query field.
 *
 * It classifies as you type and routes on submit, and it has one behaviour that
 * is worth more than the rest of it put together: A VIEWING KEY IS NEVER
 * NAVIGATED TO.
 *
 * When the field recognises a key it does not push a route, does not put the
 * value in a query string, and does not clear what you typed. It says what it
 * is holding and offers a link to /reveal, where the key is pasted into a field
 * whose own component never transmits it. The reason is mechanical rather than
 * decorative: a URL is written to session history, is sent as the referrer of
 * every subsequent request, and is visible to anything sitting between the
 * browser and the origin. A key in a URL has left the browser in every sense
 * that matters, whatever the page it lands on then promises.
 *
 * The classifier itself is `searchKind`, shared with `ZecApi`, and it never
 * makes a request - which is what lets the field say "viewing key" about a
 * string that has not been anywhere.
 */
export function TrackSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [held, setHeld] = useState(false);
  const id = useId();

  const q = value.trim();
  const kind = searchKind(q);
  const badge = q === "" ? KIND_TEXT.unknown : KIND_TEXT[kind];

  return (
    <>
      <form
        className="search"
        role="search"
        data-ui="track-search"
        onSubmit={(e) => {
          e.preventDefault();
          if (kind === "viewing-key") {
            setHeld(true);
            return;
          }
          setHeld(false);
          const href = hrefFor(q);
          if (href !== null) router.push(href);
        }}
      >
        <span className="ic" aria-hidden="true">
          <IconSearch />
        </span>
        <label htmlFor={id} className="sr-only">
          Search the chain by address, transaction, block height or viewing key
        </label>
        <input
          id={id}
          // Not `name="q"`. An unnamed field is not serialised into a GET, which
          // is one more way a pasted key cannot end up in a URL by accident.
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="t1 or t3 address - zs1 or u1 address - txid - block height - viewing key (stays in your browser)"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (held) setHeld(false);
          }}
        />
        <span className="kind" data-testid="search-kind">
          {badge}
        </span>
        <button className="go" type="submit" disabled={kind === "unknown"}>
          Trace
        </button>
      </form>

      {held ? (
        <p className="note" data-key-held style={{ marginTop: 10, maxWidth: "72ch" }}>
          <b>That is a viewing key, and this field will not navigate with it.</b> A URL is written to history and is sent as
          the referrer of the next request, so a key in one has left the browser whatever the next page promises. Nothing has
          been transmitted. Open <Link href="/reveal">the reveal ceremony</Link> and paste it into the field there, which
          decrypts locally and never uploads.
        </p>
      ) : null}
    </>
  );
}

/** The example queries under the field. Each is a real fixture the site can answer. */
export function TrackExamples() {
  const EXAMPLES: readonly { readonly href: string; readonly a: string; readonly b: string }[] = [
    {
      href: "/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo",
      a: "t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo",
      b: "ZIP 271 lockbox - consensus-labelled - 78,183.41 ZEC",
    },
    {
      href: "/tx/7ae8586467551b6a023cdc7ef0b851f3729ee3f25b21c86902f1438f23cacc1c",
      a: "7ae85864...",
      b: "50,000.5541 unshield - round-trip case - delta 0.4059 - 52 min",
    },
    { href: "/block/3191051", a: "3,191,051", b: "the block that unshield landed in - exact all the way down" },
    { href: "/pools", a: "pools", b: "five lanes - 24h crossings - the unprovable residual" },
    {
      href: "/reveal?addr=u1l8xunezsvhq8fgzfl7404m450nwnd76zshscn6nfys7vyz2ywyh4cc5daaq0c7q2su5lqfh23sp7fkf3kdvtd8dmk6vc3dnr7tqkmrpt7gqr7a5u",
      a: "u1l8xune...",
      b: "a unified address - not on chain - mode B",
    },
  ];

  return (
    <div className="tk-examples" aria-label="Example queries">
      {EXAMPLES.map((e) => (
        <Link key={e.href} href={e.href}>
          <span className="a">{e.a}</span>
          <span className="b">{e.b}</span>
        </Link>
      ))}
    </div>
  );
}
