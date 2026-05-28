import type { CardData, Position } from "../timeline";

const posClass: Record<Position, string> = {
  "center": "pos-center",
  "top-left": "pos-top-left",
  "top-right": "pos-top-right",
  "mid-left": "pos-mid-left",
  "mid-right": "pos-mid-right",
  "bottom-left": "pos-bottom-left",
  "bottom-mid": "pos-bottom-mid",
  "bottom-right": "pos-bottom-right",
};

export function IntroCard({ data }: { data: CardData }) {
  return (
    <div
      className={`intro-card ${posClass[data.position]}`}
      data-kind={data.kind ?? "neutral"}
      data-card-id={data.id}
    >
      <div className="h">{data.header}</div>
      <div className="b">
        {data.stars ? (
          <span className="stars">
            {"★".repeat(data.stars.lit)}
            <span className="stars-off">
              {"★".repeat(data.stars.total - data.stars.lit)}
            </span>{" "}
            {data.body}
          </span>
        ) : (
          data.body
        )}
      </div>
      {data.bodyExtra && <div className="b-extra">{data.bodyExtra}</div>}
    </div>
  );
}
