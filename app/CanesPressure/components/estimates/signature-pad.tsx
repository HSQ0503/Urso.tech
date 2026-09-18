"use client";

import { useEffect, useRef } from "react";

export type SignatureDrawing = {
  strokes: number[][][];
  width: number;
  height: number;
};
export function SignaturePad({
  value,
  onChange,
}: {
  value: SignatureDrawing;
  onChange: (value: SignatureDrawing) => void;
}) {
  const drawing = useRef(false);
  const current = useRef(value);
  useEffect(() => {
    current.current = value;
  }, [value]);
  return (
    <div className="space-y-2">
      <p id="signature-instructions" className="text-sm">
        Draw your signature below. Use Clear to start again.
      </p>
      <svg
        role="img"
        aria-label="Drawn customer signature"
        aria-describedby="signature-instructions"
        viewBox="0 0 600 180"
        className="w-full rounded-lg border border-[var(--cp-line-strong)] bg-white text-black"
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          if (current.current.strokes.length >= 100) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = true;
          const box = event.currentTarget.getBoundingClientRect();
          const point = [
            ((event.clientX - box.left) * 600) / box.width,
            ((event.clientY - box.top) * 180) / box.height,
          ];
          const next = {
            ...current.current,
            strokes: [...current.current.strokes, [point]],
          };
          current.current = next;
          onChange(next);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const strokes = current.current.strokes;
          if (
            !strokes.length ||
            strokes.reduce((n, s) => n + s.length, 0) >= 5000
          )
            return;
          const box = event.currentTarget.getBoundingClientRect();
          const point = [
            Math.max(
              0,
              Math.min(600, ((event.clientX - box.left) * 600) / box.width),
            ),
            Math.max(
              0,
              Math.min(180, ((event.clientY - box.top) * 180) / box.height),
            ),
          ];
          const next = {
            ...current.current,
            strokes: [
              ...strokes.slice(0, -1),
              [...strokes[strokes.length - 1], point],
            ],
          };
          current.current = next;
          onChange(next);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      >
        {value.strokes.map((stroke, index) => (
          <polyline
            key={index}
            points={stroke.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <button
        type="button"
        className="cp-btn"
        onClick={() => onChange({ strokes: [], width: 600, height: 180 })}
      >
        Clear signature
      </button>
      <p className="text-sm">
        If you cannot draw a signature, call Canes at 561-537-5674 to record
        your agreement by phone.
      </p>
    </div>
  );
}
