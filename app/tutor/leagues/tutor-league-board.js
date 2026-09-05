"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const TIERS = ["bronze", "silver", "gold", "platinum", "diamond"];
const TIER_LABEL = { bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum", diamond: "Diamond" };

export default function TutorLeagueBoard() {
  const supabase = createClient();

  const [myInfo, setMyInfo] = useState(null);
  const [active, setActive] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc("get_my_tutor_league_info").then(({ data }) => {
      const info = data?.[0] || null;
      setMyInfo(info);
      setActive(info?.current_league || "bronze");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!active || !myInfo?.school_id) return;
    setLoading(true);
    supabase
      .rpc("get_tutor_league_standings", { p_school_id: myInfo.school_id, p_league: active })
      .then(({ data }) => {
        setRows(data || []);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, myInfo?.school_id]);

  return (
    <div>
      {myInfo && (
        <div className="card">
          <div className="field-row">
            <span className="field-row__label">Your league</span>
            <span className="field-row__value" style={{ textTransform: "capitalize" }}>{myInfo.current_league}</span>
          </div>
          <div className="field-row">
            <span className="field-row__label">This week's EXP</span>
            <span className="field-row__value">{myInfo.period_exp}</span>
          </div>
          <div className="field-row">
            <span className="field-row__label">Rank in league</span>
            <span className="field-row__value">#{myInfo.rnk} of {myInfo.tier_size}</span>
          </div>
        </div>
      )}

      <div className="toggle" style={{ marginBottom: 20, flexWrap: "wrap" }}>
        {TIERS.map((t) => (
          <button key={t} type="button" className="toggle__btn" data-active={active === t} onClick={() => setActive(t)}>
            {TIER_LABEL[t]}
          </button>
        ))}
      </div>

      {loading && <p>Loading...</p>}
      {!loading && rows.length === 0 && <p>No tutors in this league yet.</p>}

      {!loading && rows.map((r) => (
        <div key={r.tutor_id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span><strong>#{r.rnk}</strong> {r.full_name}</span>
          <span>{r.period_exp} EXP this week</span>
        </div>
      ))}

      <p style={{ fontSize: 13, color: "var(--ink-600)", marginTop: 16 }}>
        Top 30% of each league get promoted, bottom 50% get demoted, every Monday.
      </p>
    </div>
  );
}