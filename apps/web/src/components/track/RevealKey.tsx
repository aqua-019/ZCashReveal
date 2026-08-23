"use client";

import { useId, useState } from "react";

/**
 * Mode A: the viewing-key ceremony, with the 2.1 gate closed.
 *
 * WHAT THIS COMPONENT DOES NOT DO is the whole specification. It contains no
 * `fetch`, no `XMLHttpRequest`, no `WebSocket`, no `navigator.sendBeacon`, no
 * form action and no `<form>` at all - the field is not inside one, so there is
 * nothing for a stray Enter to submit and nowhere for the browser to serialise
 * the value to. The key is held in React state in this tab, is never written to
 * `localStorage`, never put in a URL and never logged. The security review at
 * the gate checks exactly that, and `test/e2e/reveal.spec.ts` checks it from
 * outside by recording every request the page makes while a key is typed.
 *
 * WHAT IT DOES DO is validate the PREFIX, client-side, and say what the key
 * would reveal. That is a real service and it is honest: recognising `uview1`
 * as a unified full viewing key requires no decryption and no network, and
 * telling a reader that a Sapling incoming key will show them received notes
 * but not their own balance is the difference between a ceremony and a form.
 *
 * The gate is closed, and closed visibly. HANDOFF-13 is the plan-only handoff
 * for WASM decryption, and it stops for approval. Until it lands, this pane
 * refuses to pretend: it says which release does the work, and it renders no
 * balance, because Mode B never shows one and a Mode A that has not decrypted
 * anything has nothing to show either.
 */

/** What each recognised prefix is, and what holding it would reveal. */
interface KeyShape {
  readonly kind: string;
  readonly reveals: readonly string[];
  readonly withholds: readonly string[];
}

const SHAPES: readonly (readonly [RegExp, KeyShape])[] = [
  [
    /^uview1[0-9a-z]{20,}$/i,
    {
      kind: "unified full viewing key",
      reveals: [
        "every note received by every receiver in the unified address, with value, memo, txid and height",
        "nullifiers of those notes, so spent and unspent are distinguishable and the balance is exact",
        "your own outgoing outputs through the outgoing key: recipients and values you sent",
      ],
      withholds: ["who sent to you - the sender is not in the note", "anyone else's notes", "anything about addresses you do not hold keys for"],
    },
  ],
  [
    /^zxviews1[0-9a-z]{20,}$/i,
    {
      kind: "Sapling extended full viewing key",
      reveals: [
        "every Sapling note received, with value, memo, txid and height",
        "nullifiers of those notes, so the Sapling balance is exact",
        "your own outgoing Sapling outputs through the outgoing key",
      ],
      withholds: ["Orchard or Ironwood notes - a Sapling key sees the Sapling pool and nothing else", "who sent to you", "anyone else's notes"],
    },
  ],
  [
    /^zivks1[0-9a-z]{20,}$/i,
    {
      kind: "incoming viewing key",
      reveals: ["every note received, with value, memo, txid and height"],
      withholds: [
        "whether any of those notes has been SPENT - an incoming key derives no nullifiers, so it cannot give a balance, only a total received",
        "your own outgoing transfers",
        "who sent to you",
      ],
    },
  ],
];

type Verdict =
  | { readonly state: "empty" }
  | { readonly state: "unrecognised" }
  | { readonly state: "recognised"; readonly shape: KeyShape };

/**
 * Classify the key by prefix and length alone.
 *
 * Deliberately not a decode: decoding a bech32m payload would need the checksum
 * routine and a bech32 implementation, which is HANDOFF-13's work, and getting
 * it half right would produce a page that says "invalid" about a valid key.
 * Prefix and plausible length is the strongest claim this build can honestly
 * make, and the copy says so.
 */
function classify(raw: string): Verdict {
  const q = raw.trim();
  if (q === "") return { state: "empty" };
  for (const [pattern, shape] of SHAPES) {
    if (pattern.test(q)) return { state: "recognised", shape };
  }
  return { state: "unrecognised" };
}

export function RevealKey() {
  const [key, setKey] = useState("");
  const id = useId();
  const verdict = classify(key);

  return (
    <div className="tk-pane" data-ui="mode-a">
      <div className="eyebrow">
        <b>mode A</b> - viewing key - decrypted in your browser - never uploaded
      </div>

      {/* Deliberately not a <form>. There is no action to submit to and no
          browser serialisation of the value, which is one fewer way a key can
          leave this tab. */}
      <div className="tk-keyin">
        <label htmlFor={id} className="sr-only">
          Viewing key. It stays in this browser tab and is never transmitted.
        </label>
        <input
          id={id}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="uview1... / zxviews1... / zivks1..."
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
          }}
        />
        <button type="button" disabled title="Decryption arrives in 2.1 - HANDOFF-13">
          Reveal
        </button>
      </div>

      <div className={verdict.state === "unrecognised" ? "cp tk-keystate bad" : "cp tk-keystate"} data-key-state={verdict.state} aria-live="polite">
        {verdict.state === "empty" ? (
          <>Nothing entered. Nothing has been sent, and nothing will be: this field has no network path out of it.</>
        ) : verdict.state === "unrecognised" ? (
          <>
            <b>Not a viewing-key prefix this build recognises.</b> Checked in this tab against `uview1`, `zxviews1` and
            `zivks1`. Still not transmitted.
          </>
        ) : (
          <>
            <b>{verdict.shape.kind}</b>
            {" recognised by prefix and length, in this tab. The payload is not decoded: a bech32m checksum needs the "}
            decoder that arrives with the decryption itself, and a half-implemented one would call a valid key invalid.
          </>
        )}
      </div>

      {verdict.state === "recognised" ? (
        <div className="tk-reveals" style={{ marginTop: 12 }}>
          <div className="rv yes">
            <b>would reveal</b>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {verdict.shape.reveals.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
          <div className="rv no">
            <b>would not reveal</b>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {verdict.shape.withholds.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <hr className="hair" style={{ margin: "14px 0" }} />

      <p className="note" data-ui="mode-a-gate">
        <b>Decryption is gated and arrives in 2.1.</b> The work is a WASM build of the Zcash key and note-encryption
        libraries, running trial decryption over compact blocks fetched from the gateway - in this tab, with the key never
        leaving it. It is planned in HANDOFF-13, which stops for approval before any of it is written. Until then this pane
        renders no balance and no note, because a Mode A that has decrypted nothing has nothing to show, and showing
        something anyway is what the rest of this site exists to argue against.
      </p>
    </div>
  );
}
