"use client";

// Reopens the tour from Settings. The shell (mounted in the gated layout)
// listens for this event — same CustomEvent pattern as canes:contact-edit.
export function TourReplayButton() {
  return (
    <button
      type="button"
      className="cp-btn"
      onClick={() => window.dispatchEvent(new CustomEvent("canes:tour-open"))}
    >
      Start the tour
    </button>
  );
}
