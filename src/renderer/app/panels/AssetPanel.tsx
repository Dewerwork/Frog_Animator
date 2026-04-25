export function AssetPanel() {
  return (
    <div className="panel">
      <div className="panel__header">Assets</div>
      <div className="panel__body panel__body--placeholder">
        <p>Drag PNGs or PSDs here.</p>
        <p className="muted">PSD layers are extracted automatically.</p>
      </div>
    </div>
  );
}
