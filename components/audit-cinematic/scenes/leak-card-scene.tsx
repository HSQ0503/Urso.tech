export function LeakCardScene() {
  return (
    <div className="leak-card">
      <div className="label">03 · The one fix worth making</div>
      <div className="price">
        $4,180<span className="unit">/mo</span>
      </div>
      <hr />
      <div className="row">
        <span className="k">Leak</span>
        <span className="v">After-hours missed calls</span>
      </div>
      <div className="row">
        <span className="k">Fix</span>
        <span className="v">SMS callback queue · on-call rotation</span>
      </div>
      <div className="row">
        <span className="k">Measure</span>
        <span className="v">Missed → returned · 30-day window</span>
      </div>
    </div>
  );
}
