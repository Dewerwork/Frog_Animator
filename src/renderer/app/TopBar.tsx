export function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar__brand">Frog Animator</div>
      <div className="topbar__transport">
        <button type="button" disabled>
          ◀◀
        </button>
        <button type="button" disabled>
          ▶
        </button>
        <button type="button" disabled>
          ▶▶
        </button>
        <span className="topbar__time">00:00.00 / 00:30.00</span>
      </div>
      <div className="topbar__actions">
        <button type="button" disabled>
          Render MP4…
        </button>
      </div>
    </header>
  );
}
