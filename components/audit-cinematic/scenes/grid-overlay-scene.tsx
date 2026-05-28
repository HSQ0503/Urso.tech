export function GridOverlayScene({ text }: { text: string }) {
  // Split on em-dash so we can italicize / orange-color the punchline.
  const [before, after] = text.split(" — ");
  return (
    <div className="cinematic-grid-overlay">
      {before}
      {after && (
        <>
          {" — "}
          <b>{after}</b>
        </>
      )}
    </div>
  );
}
