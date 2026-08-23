/**
 * The viewing key never leaves the browser, checked from outside the browser.
 *
 * HANDOFF-04 section 3 states the property and section 6 asks the security
 * review to confirm it. This file is the machine-checkable half: rather than
 * reading `RevealKey.tsx` and observing that it has no `fetch`, it types a real
 * viewing key into the real field on a real production build and RECORDS EVERY
 * REQUEST THE PAGE MAKES. A future edit that adds a lookup - however
 * well-intentioned - fails here rather than at review.
 *
 * The second half is the Content-Security-Policy, which turns the promise from
 * something an author maintains into something the browser enforces. In fixture
 * mode `connect-src` is `'self'` and `form-action` is `'none'`, so a fetch to
 * any origin and a form submission to anywhere are both refused by the browser
 * regardless of what the code says.
 */
import { expect, test, type Request } from "@playwright/test";

/** A real-shaped unified full viewing key. Nothing derived from it; it is a string to type. */
const KEY = `uview1${"q".repeat(180)}`;

const UNIFIED =
  "u1l8xunezsvhq8fgzfl7404m450nwnd76zshscn6nfys7vyz2ywyh4cc5daaq0c7q2su5lqfh23sp7fkf3kdvtd8dmk6vc3dnr7tqkmrpt7gqr7a5u";

/**
 * Substrings of the key that a leak would carry.
 *
 * "No request contains any substring of it" is not literally checkable - a
 * one-character substring is in everything - so what is checked is every
 * substring long enough to be evidence: the head, three interior windows and
 * the tail, each 24 characters. A leak of any contiguous run of the key
 * contains at least one of them, and none of them occurs by chance in a URL, a
 * header or a body.
 */
function fragments(key: string): readonly string[] {
  const w = 24;
  const mid = Math.floor(key.length / 2);
  return [
    key.slice(0, w),
    key.slice(Math.floor(key.length / 4), Math.floor(key.length / 4) + w),
    key.slice(mid, mid + w),
    key.slice(Math.floor((key.length * 3) / 4), Math.floor((key.length * 3) / 4) + w),
    key.slice(-w),
  ];
}

const FRAGMENTS = fragments(KEY);

test.describe("A11 pass state - the key cannot leave the tab", () => {
  test("no request over the whole session carries it in a URL, a header or a body", async ({ page }) => {
    const seen: { url: string; method: string; headers: Record<string, string>; body: string | null }[] = [];
    page.on("request", (r: Request) => {
      seen.push({ url: r.url(), method: r.method(), headers: r.headers(), body: r.postData() });
    });

    await page.goto("/reveal", { waitUntil: "networkidle" });

    const field = page.locator('[data-ui="mode-a"] input');
    await expect(field, "the Mode A field is missing").toHaveCount(1);

    const before = seen.length;
    await field.fill(KEY);
    await expect(page.locator("[data-key-state]")).toHaveAttribute("data-key-state", "recognised");
    // Every way a page might be provoked into sending: submit, blur, a second
    // edit, and a navigation attempt. Then wait, in case something is deferred.
    await page.keyboard.press("Enter");
    await field.press("Tab");
    await field.fill(`${KEY}x`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(750);

    // The whole session, not only what followed the typing: a beacon fired on
    // an earlier navigation would still be a leak.
    for (const r of seen) {
      const haystack = [r.url, r.body ?? "", ...Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`)].join("\n");
      for (const f of FRAGMENTS) {
        expect(haystack.includes(f), `a request carried the key: ${r.method} ${r.url}`).toBe(false);
      }
    }

    // Nothing was requested at all after the field was touched. That includes
    // a CSP report - the policy configures no report-uri and none is sent.
    expect(seen.slice(before).map((r) => `${r.method} ${r.url}`), "typing a key caused a request").toEqual([]);

    // And over its whole life the page spoke only to its own origin.
    const foreign = seen.filter((r) => !r.url.startsWith("http://127.0.0.1:") && !r.url.startsWith("data:"));
    expect(foreign.map((r) => r.url), "the page requested a foreign origin").toEqual([]);
  });

  test("the key is in no attribute of any element in the serialised DOM", async ({ page }) => {
    await page.goto("/reveal");
    await page.locator('[data-ui="mode-a"] input').fill(KEY);
    await expect(page.locator("[data-key-state]")).toHaveAttribute("data-key-state", "recognised");

    const leak = await page.evaluate((frags: readonly string[]) => {
      const carries = (s: string): boolean => frags.some((f) => s.includes(f));
      const attrs: string[] = [];
      const walk = (el: Element): void => {
        for (const a of Array.from(el.attributes)) {
          if (carries(a.value)) attrs.push(`${el.tagName}[${a.name}]`);
        }
        for (const c of Array.from(el.children)) walk(c);
      };
      walk(document.documentElement);

      const texts: string[] = [];
      const it = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = it.nextNode()) !== null) {
        if (carries(n.nodeValue ?? "")) texts.push(n.parentElement?.tagName ?? "?");
      }

      const inStorage = (s: Storage): boolean => {
        for (let i = 0; i < s.length; i += 1) {
          const k = s.key(i);
          if (k !== null && (carries(k) || carries(s.getItem(k) ?? ""))) return true;
        }
        return false;
      };

      return {
        attributes: attrs,
        textNodes: texts,
        serialised: carries(document.documentElement.outerHTML),
        url: carries(location.href),
        title: carries(document.title),
        cookie: carries(document.cookie),
        local: inStorage(localStorage),
        session: inStorage(sessionStorage),
        // The live property is where a typed character inherently is. Its
        // presence is what proves this check is looking at a field that
        // actually holds the key.
        liveProperty: (document.querySelector('[data-ui="mode-a"] input') as HTMLInputElement | null)?.value.startsWith(frags[0] ?? "") ?? false,
      };
    }, FRAGMENTS);

    expect(leak.liveProperty, "the field does not hold the key, so this check proves nothing").toBe(true);
    expect(leak.attributes, "the key is in a DOM attribute").toEqual([]);
    expect(leak.textNodes, "the key is in a text node").toEqual([]);
    expect(leak.serialised, "the key is in the serialised document").toBe(false);
    expect(leak.url, "the key is in the URL").toBe(false);
    expect(leak.title, "the key is in the document title").toBe(false);
    expect(leak.cookie, "the key is in a cookie").toBe(false);
    expect(leak.local, "the key is in localStorage").toBe(false);
    expect(leak.session, "the key is in sessionStorage").toBe(false);
  });

  test("the field's own attributes close the browser's routes out", async ({ page }) => {
    await page.goto("/reveal");
    const field = page.locator('[data-ui="mode-a"] input');

    const shape = await field.evaluate((el: HTMLInputElement) => ({
      autocomplete: el.getAttribute("autocomplete"),
      spellcheck: el.getAttribute("spellcheck"),
      name: el.getAttribute("name"),
      type: el.getAttribute("type"),
      // The one that matters most: an input inside a form can be submitted by
      // Enter, and a form with no action submits to the current URL - which
      // would put the key in a URL and in the server's access log.
      form: el.form === null ? null : (el.form.getAttribute("action") ?? "same-document"),
      insideForm: el.closest("form") !== null,
    }));

    expect(shape.autocomplete, "the browser may store and re-offer the key").toBe("off");
    expect(shape.spellcheck, "the key may be sent to a spellchecking service").toBe("false");
    expect(shape.name, "a named field is serialised into a form submission").toBeNull();
    expect(shape.insideForm, "the field is inside a form and Enter could submit it").toBe(false);
    expect(shape.form, "the field is associated with a form").toBeNull();
    expect(shape.type, "a search input is offered to the browser's search history").toBe("text");
  });

  test("the search field refuses to navigate with a key, and says why", async ({ page }) => {
    await page.goto("/track");
    const before = page.url();
    await page.locator('[data-ui="track-search"] input').fill(KEY);
    await page.locator('[data-ui="track-search"] button[type="submit"]').click();
    await expect(page.locator("[data-key-held]"), "the field navigated, or said nothing").toBeAttached();
    expect(page.url(), "the field navigated with a key in scope").toBe(before);
    for (const f of FRAGMENTS) expect(page.url()).not.toContain(f);
  });

  test("and the search field is uncontrolled too, so a key typed THERE is not serialised either", async ({ page }) => {
    // The same defect, on the other field that can receive a key. It is the
    // front door, and a reader who does not know about /reveal will paste a key
    // into it first.
    await page.goto("/track");
    await page.locator('[data-ui="track-search"] input').fill(KEY);
    const inDom = await page.evaluate((frags: readonly string[]) => frags.some((f) => document.documentElement.outerHTML.includes(f)), FRAGMENTS);
    expect(inDom, "a key typed into the search field was serialised into the DOM").toBe(false);
  });

  test("a shielded ADDRESS is carried in the URL, because it is not a secret", async ({ page }) => {
    // The contrast that makes the rule above meaningful rather than blanket.
    await page.goto("/track");
    await page.locator('[data-ui="track-search"] input').fill(UNIFIED);
    await page.locator('[data-ui="track-search"] button[type="submit"]').click();
    await page.waitForURL(/\/reveal\?addr=/);
    expect(page.url()).toContain("addr=");
  });

  test("the gate is closed and says which release opens it", async ({ page }) => {
    await page.goto("/reveal");
    await expect(page.locator('[data-ui="mode-a"] button')).toBeDisabled();
    await expect(page.locator('[data-ui="mode-a-gate"]')).toContainText("2.1");
  });

  test("A11 fail state - the checks are not vacuous", async ({ page }) => {
    // Each negative above is only worth something if the same check fires when
    // the value IS present. Proved by putting the key where each check looks.
    await page.goto("/reveal");
    const planted = await page.evaluate((frags: readonly string[]) => {
      const el = document.createElement("div");
      el.setAttribute("data-planted", frags[0] ?? "");
      document.body.append(el);
      const carries = (s: string): boolean => frags.some((f) => s.includes(f));
      const attrs: string[] = [];
      const walk = (e: Element): void => {
        for (const a of Array.from(e.attributes)) if (carries(a.value)) attrs.push(`${e.tagName}[${a.name}]`);
        for (const c of Array.from(e.children)) walk(c);
      };
      walk(document.documentElement);
      const out = { attributes: attrs, serialised: carries(document.documentElement.outerHTML) };
      el.remove();
      return out;
    }, FRAGMENTS);

    expect(planted.attributes, "the attribute walk missed a planted value").toEqual(["DIV[data-planted]"]);
    expect(planted.serialised, "the serialisation check missed a planted value").toBe(true);
  });
});

/**
 * The fog tints the ground, not the glyphs.
 *
 * A gate round measured the first version and found real reading text at
 * 1.99:1 and 1.18:1 - an `inset: 0` pseudo-element on a positioned pane paints
 * above normal-flow inline content, so the veil was over the words rather than
 * under them. Two declarations fix it and this is what holds them: the pane
 * isolates a stacking context, and the veil takes `z-index: -1`, which paints
 * after the pane's background and before every in-flow descendant.
 *
 * It also checks the branch has something focusable in it. The fog thins on
 * `:focus-within`, and the shielded branch had no focusable descendant at all -
 * so a keyboard-only or touch reader had no mechanism to lift it.
 */
test.describe("the Mode B fog", () => {
  const UNIFIED_ADDR = UNIFIED;

  test("paints behind the text rather than over it", async ({ page }) => {
    await page.goto(`/reveal?addr=${encodeURIComponent(UNIFIED_ADDR)}`);
    const shape = await page.locator('[data-ui="mode-b"]').evaluate((el: Element) => ({
      isolation: getComputedStyle(el).isolation,
      veilZ: getComputedStyle(el, "::before").zIndex,
      veilContent: getComputedStyle(el, "::before").content,
    }));
    expect(shape.veilContent, "there is no fog, so this proves nothing").not.toBe("none");
    expect(shape.veilZ, "the fog paints over the text").toBe("-1");
    expect(shape.isolation, "without a stacking context a negative z-index escapes the pane").toBe("isolate");
  });

  test("the shielded branch has a focusable control, so :focus-within can fire", async ({ page }) => {
    await page.goto(`/reveal?addr=${encodeURIComponent(UNIFIED_ADDR)}`);
    // The shielded branch is a client island behind Suspense - wait for it,
    // rather than counting the fallback's zero links and calling it a finding.
    await expect(page.locator('[data-ui="mode-b-address"]')).toBeVisible();
    const focusable = page.locator('[data-ui="mode-b"] a[href], [data-ui="mode-b"] button, [data-ui="mode-b"] input');
    expect(await focusable.count(), "nothing in the pane can take focus").toBeGreaterThan(0);
    await focusable.first().focus();
    await expect(focusable.first()).toBeFocused();
  });
});

test.describe("the policy the browser enforces", () => {
  test("connect-src is self alone in fixture mode, and form-action is none", async ({ page }) => {
    const response = await page.goto("/reveal");
    const csp = response?.headers()["content-security-policy"] ?? "";
    expect(csp, "no Content-Security-Policy is served").not.toBe("");

    // The three directives that carry the key promise.
    expect(csp, "connect-src is wider than this origin in fixture mode").toContain("connect-src 'self';");
    expect(csp, "a form could submit somewhere").toContain("form-action 'none'");
    expect(csp, "an injected base tag could re-point a relative request").toContain("base-uri 'none'");

    // And the rest of the policy.
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("no URL this site produces is sent as a referrer", async ({ page }) => {
    const response = await page.goto("/reveal");
    expect(response?.headers()["referrer-policy"], "a URL from this site could be sent as a referrer").toBe("no-referrer");
  });

  test("the other headers are present on every route", async ({ page }) => {
    for (const route of ["/", "/track", "/pools", "/reveal", "/beware"]) {
      const response = await page.goto(route);
      const h = response?.headers() ?? {};
      expect(h["x-content-type-options"], `${route}`).toBe("nosniff");
      expect(h["x-frame-options"], `${route}`).toBe("DENY");
      expect(h["content-security-policy"], `${route} has no CSP`).toBeTruthy();
    }
  });

  test("fail state - the policy is not vacuous", async ({ page }) => {
    // A CSP that permits everything would pass a "is a CSP served" check. This
    // one names what it forbids, and the check would fail if any of the three
    // strictest directives were relaxed.
    const response = await page.goto("/reveal");
    const csp = response?.headers()["content-security-policy"] ?? "";
    expect(csp).not.toContain("connect-src *");
    expect(csp).not.toContain("default-src *");
    expect(csp).not.toContain("form-action *");
    expect(csp.includes("'unsafe-eval'"), "the policy permits eval").toBe(false);
  });
});
