/**
 * Confidence, as the content schema records it. Every Record claim carries one
 * (CLAUDE.md: sources[] + confidence + lastVerified), and it is always
 * displayed - a claim whose confidence is hidden is a claim being oversold.
 */
export type Confidence = "high" | "med" | "low";

export function Conf({ level }: { readonly level: Confidence }) {
  return (
    <span className={`conf ${level}`} data-primitive="Conf" data-level={level}>
      {level}
    </span>
  );
}
