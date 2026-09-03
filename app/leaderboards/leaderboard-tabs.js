"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SCOPES = (departmentId, facultyId, schoolId) => [
  { key: "department", label: "Department", scopeId: departmentId },
  { key: "faculty", label: "Faculty", scopeId: facultyId },
  { key: "school", label: "School", scopeId: schoolId },
  { key: "universal", label: "Universal", scopeId: null },
];

export default function LeaderboardTabs({ departmentId, facultyId, schoolId }) {
  const supabase = createClient();
  const scopes = SCOPES(departmentId, facultyId, schoolId);

  const [active, setActive] = useState(scopes[0].key);
  const [rows, setRows] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const scope = scopes.find((s) => s.key === active);
    if (!scope) return;

    if (scope.key !== "universal" && !scope.scopeId) {
      setRows([]);
      setMyRank(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([
      supabase.rpc("get_leaderboard", { p_scope: scope.key, p_scope_id: scope.scopeId, p_limit: 50 }),
      supabase.rpc("get_my_rank", { p_scope: scope.key, p_scope_id: scope.scopeId }),
    ]).then(([leaderboardRes, rankRes]) => {
      setRows(leaderboardRes.data || []);
      setMyRank(rankRes.data?.[0] || null);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div>
      <div className="toggle" style={{ marginBottom: 20 }}>
        {scopes.map((s) => (
          <button
            key={s.key}
            type="button"
            className="toggle__btn"
            data-active={active === s.key}
            onClick={() => setActive(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {myRank && (
        <div className="card">
          <div className="field-row">
            <span className="field-row__label">Your rank</span>
            <span className="field-row__value">#{myRank.rnk} of {myRank.total_participants}</span>
          </div>
          <div className="field-row">
            <span className="field-row__label">Your EXP</span>
            <span className="field-row__value">{myRank.total_exp}</span>
          </div>
          <div className="field-row">
            <span className="field-row__label">Your streak</span>
            <span className="field-row__value">🔥 {myRank.current_streak}</span>
          </div>
        </div>
      )}

      {loading && <p>Loading...</p>}

      {!loading && rows.length === 0 && <p>No ranked students in this scope yet.</p>}

      {!loading && rows.map((r) => (
        <div key={r.student_id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span><strong>#{r.rnk}</strong> {r.full_name}</span>
          <span>{r.total_exp} EXP · 🔥 {r.current_streak}</span>
        </div>
      ))}
    </div>
  );
}