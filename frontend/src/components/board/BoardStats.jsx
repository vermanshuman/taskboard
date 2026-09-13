"use client";

const SPINES = ["var(--spine-1)", "var(--spine-2)", "var(--spine-3)", "var(--spine-4)", "var(--spine-5)"];

export default function BoardStats({ isOpen, stats, totalCards }) {
  if (!isOpen) return null;

  return (
    <div className="stats-panel">
      <div className="stats-head">
        <h2>Project health</h2>
        <span className="total">Total tasks: <strong>{totalCards}</strong></span>
      </div>

      {!stats ? (
        <div className="panel-hint">Loading…</div>
      ) : (
        <div className="stats-grid">
          <div>
            <h4>Cards per column</h4>
            <div className="stats-rows">
              {stats.cards_per_list.map((item, idx) => {
                const ratio = totalCards > 0 ? (item.count / totalCards) * 100 : 0;
                return (
                  <div key={item.list + idx} className="stats-row">
                    <span className="name">{item.list}</span>
                    <div className="bar">
                      <div style={{ width: `${ratio}%`, background: SPINES[idx % SPINES.length] }} />
                    </div>
                    <span className="n">{item.count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h4>Completed per week (last 8)</h4>
            <div className="week-strip">
              {stats.completed_per_week.map((w) => (
                <div key={w.week} className="week-tile">
                  <span className={`n ${w.count > 0 ? "active" : ""}`}>{w.count}</span>
                  <span className="w">{w.week.split("-")[1]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
