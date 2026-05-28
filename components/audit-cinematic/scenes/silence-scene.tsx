import { ArrowRight } from "@/components/ui/arrow-right";

type Props = {
  phase: "dot" | "line" | "cta";
  text?: string;
};

export function SilenceScene({ phase, text }: Props) {
  if (phase === "dot") return <div className="silence-dot" />;
  if (phase === "line") {
    // Split on the last sentence's period so we can italicize / orange the punchline.
    const parts = (text ?? "").split(". ");
    const head = parts[0] ? `${parts[0]}.` : "";
    const tail = parts.slice(1).join(". ");
    return (
      <div className="silence-line">
        {head} {tail && <b>{tail}</b>}
      </div>
    );
  }
  // CTA — this is the button the handoff will measure and merge into.
  return (
    <div className="silence-cta">
      <a href="#request-an-audit" data-cinematic-cta>
        Request an audit
        <ArrowRight />
      </a>
    </div>
  );
}
