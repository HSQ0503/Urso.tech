import { fmtEt, fmtMoney, type EstimateAcceptance } from "@urso/types";

export function AcceptanceHistory({
  records,
}: {
  records: EstimateAcceptance[];
}) {
  if (!records.length) return null;
  return (
    <section className="my-5 space-y-3">
      {records.map((record) => (
        <details key={record.id} className="cp-card p-4">
          <summary className="cursor-pointer font-semibold">
            Accepted version {record.revision} · {fmtMoney(record.totalCents)}
          </summary>
          <p className="my-3">
            {record.signatureName} ·{" "}
            {record.source === "customer"
              ? "Customer signature"
              : "Agreed by phone / in person"}{" "}
            · {fmtEt(record.approvedAt)}
          </p>
          {record.drawing ? (
            <svg
              role="img"
              aria-label="Customer signature"
              className="max-w-md bg-white text-black"
              viewBox="0 0 600 180"
            >
              {record.drawing.strokes.map((stroke, index) => (
                <polyline
                  key={index}
                  points={stroke.map((p) => p.join(",")).join(" ")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
              ))}
            </svg>
          ) : (
            <p className="text-sm">
              Historical acceptance: no drawn signature was captured.
            </p>
          )}
          {record.items.map((item, index) => (
            <div key={index} className="flex justify-between gap-4 py-2">
              <span>
                {item.name} × {item.quantity}
              </span>
              <span>{fmtMoney(item.line_total_cents)}</span>
            </div>
          ))}
          <h3 className="mt-3 font-semibold">Terms accepted</h3>
          <p className="whitespace-pre-wrap text-sm">{record.terms}</p>
        </details>
      ))}
    </section>
  );
}
