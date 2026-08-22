import Link from "next/link";

import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";
import { SCREENS } from "@/lib/nav";

/** 404. Same shell, same register: a stated absence rather than an apology. */
export default function NotFound() {
  return (
    <>
      <div className="record-head">
        <div>
          <Eyebrow idx="404">no such surface</Eyebrow>
          <h1 style={{ marginTop: 14 }}>
            Not <em>found</em>
          </h1>
          <p className="dek">
            That route does not exist. It may belong to a handoff that has not shipped yet - the tracking views and the
            per-claim permalinks arrive with HANDOFF-03 and HANDOFF-04.
          </p>
        </div>
      </div>
      <Glass>
        <Eyebrow>surfaces that do exist</Eyebrow>
        <ul className="legend" style={{ marginTop: 12 }}>
          {SCREENS.map((s) => (
            <li key={s.href}>
              <Link href={s.href}>
                {s.idx} {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </Glass>
    </>
  );
}
