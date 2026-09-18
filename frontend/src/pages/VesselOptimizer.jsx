import { useEffect, useMemo, useState } from "react";
import {
  Ship,
  Anchor,
  Gauge,
  Clock3,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import Field from "../components/Field";
import { api } from "../api";

const money = (n) => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;
const num = (n) => Number(n || 0).toLocaleString("en-IN");

function portInfoFromRefs(refs, port) {
  return refs?.ports?.[port] || {};
}

function normaliseResult(raw) {
  const source = raw || {};
  const candidates = source.ranked || source.options || source.vessels || [];
  const best = source.best || candidates[0] || null;

  const rows = candidates.map((v, index) => ({
    ...v,
    rank: v.rank ?? index + 1,
    name: v.name || v.vessel || v.vessel_name || v.type || "Vessel",
    class: v.class || v.vessel_class || v.vessel_type || v.type || v.vessel || "—",
    capacity_mt: v.capacity_mt ?? v.cargo_capacity_mt ?? v.capacity ?? 0,
    dwt_mt: v.dwt_mt ?? v.dwt ?? 0,
    draft_m: v.draft_m ?? v.draft_req_m ?? v.draft ?? 0,
    loa_m: v.loa_m ?? v.loa_req_m ?? v.length_m ?? v.loa ?? 0,
    beam_m: v.beam_m ?? v.beam_req_m ?? v.beam ?? 0,
    shipments_needed: v.shipments_needed ?? v.trips ?? 1,
    eta_days: v.eta_days ?? v.etaDays ?? 0,
    cost_per_mt: v.cost_per_mt ?? v.costPerMT ?? 0,
    total_cost: v.total_cost ?? v.totalCost ?? 0,
    optimisation_score:
      v.optimisation_score ?? v.optimization_score ?? v.score ?? 0,
    feasible: v.feasible !== false,
    reason: v.reason || v.rejection_reason || "",
  }));

  const bestName =
    best?.name || best?.vessel || best?.vessel_name || best?.type;

  return {
    best:
      rows.find((r) => r.name === bestName) ||
      (best
        ? {
            ...best,
            name: bestName || "Recommended Vessel",
            class:
              best.class ||
              best.vessel_class ||
              best.vessel_type ||
              best.type ||
              "—",
            capacity_mt:
              best.capacity_mt ??
              best.cargo_capacity_mt ??
              best.capacity ??
              0,
            shipments_needed: best.shipments_needed ?? best.trips ?? 1,
            eta_days: best.eta_days ?? best.etaDays ?? 0,
            cost_per_mt: best.cost_per_mt ?? best.costPerMT ?? 0,
            optimisation_score:
              best.optimisation_score ??
              best.optimization_score ??
              best.score ??
              0,
            preferred_contract: best.preferred_contract,
            entry_window: best.entry_window,
            voyages_needed: best.voyages_needed,
          }
        : null),
    rows,
    port: source.port || source.port_name || "Selected Port",
    constraints: source.port_constraints || source.constraints || {},
    recommendation: source.recommendation || null,
    charter: source.charter || null,
  };
}

export default function VesselOptimizer({ auth }) {
  const [refs, setRefs] = useState(null);
  const [port, setPort] = useState("");
  const [material, setMaterial] = useState("");
  const [origin, setOrigin] = useState("");
  const [cargo, setCargo] = useState(80000);
  const [deadline, setDeadline] = useState(30);
  const [priority, setPriority] = useState(55);

  const [result, setResult] = useState(null);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const plantCode =
    auth?.manager?.plant ||
    auth?.plant?.code ||
    auth?.plant?.plant_code ||
    "RSP";

  useEffect(() => {
    let active = true;

    api("/api/refs")
      .then((data) => {
        if (!active) return;

        setRefs(data);

        const portKeys = Object.keys(data.ports || {});
        const materialKeys = Object.keys(data.materials || {});
        const originKeys = Object.keys(data.origins || {});

        setPort((current) =>
          current && data.ports?.[current] ? current : portKeys[0] || ""
        );
        setMaterial((current) =>
          current && data.materials?.[current]
            ? current
            : materialKeys[0] || ""
        );
        setOrigin((current) =>
          current && data.origins?.[current]
            ? current
            : originKeys[0] || ""
        );
      })
      .catch((err) => {
        if (active) setError(err.message || "Unable to load reference data.");
      })
      .finally(() => {
        if (active) setLoadingRefs(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedPortInfo = useMemo(
    () => portInfoFromRefs(refs, port),
    [refs, port]
  );

  async function optimise() {
    if (!port) return;

    setRunning(true);
    setError("");
    setResult(null);

    try {
      const raw = await api("/api/vessel-optimizer", {
        method: "POST",
        body: JSON.stringify({
          port,
          material: material || null,
          origin: origin || null,
          quantity_mt: Number(cargo),
          deadline_days: Number(deadline),
          priority: Number(priority),
          plant_code: plantCode,
        }),
      });

      setResult(normaliseResult(raw));
    } catch (err) {
      setError(err.message || "Unable to optimise vessels.");
    } finally {
      setRunning(false);
    }
  }

  const rows = result?.rows || [];
  const best = result?.best || null;
  const constraints = result?.constraints || {};

  const maxDraft =
    constraints.max_draft_m ??
    selectedPortInfo.max_draft_m ??
    selectedPortInfo.draft_m;

  const maxLoa =
    constraints.max_loa_m ??
    selectedPortInfo.max_loa_m ??
    selectedPortInfo.loa_m;

  const maxBeam =
    constraints.max_beam_m ??
    selectedPortInfo.max_beam_m ??
    selectedPortInfo.beam_m;

  const queued =
    constraints.ships_in_queue ?? selectedPortInfo.ships_in_queue;

  const berths = constraints.berths ?? selectedPortInfo.berths;

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Vessel Optimizer</h3>
            <p>Keep the port fixed and optimise vessel selection.</p>
          </div>
          <button
            className="primary"
            onClick={optimise}
            disabled={running || loadingRefs || !port}
          >
            {running ? <Loader2 size={14} className="spin" /> : <Gauge size={14} />}
            {running ? "Optimising…" : "Optimise vessel"}
          </button>
        </div>

        <div className="form-grid">
          <Field label="Destination Port">
            <select value={port} onChange={(e) => setPort(e.target.value)}>
              {refs &&
                Object.entries(refs.ports || {}).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Material">
            <select
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
            >
              {refs &&
                Object.entries(refs.materials || {}).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Origin">
            <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
              {refs &&
                Object.entries(refs.origins || {}).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Cargo Quantity">
            <div className="unit-input">
              <input
                type="number"
                min="1"
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
              />
              <span>MT</span>
            </div>
          </Field>
          <Field label="Deadline (days)">
            <input
              type="number"
              min="1"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </Field>
        </div>

        <div className="priority-box">
          <div>
            <b>Cost ↔ deadline preference</b>
            <small>
              {priority < 35
                ? "Cost priority"
                : priority > 65
                  ? "Deadline priority"
                  : "Balanced"}
            </small>
          </div>

          <div className="priority-control">
            <span>Cost</span>
            <input
              type="range"
              min="0"
              max="100"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
            <span>Deadline</span>
          </div>
        </div>
      </section>

      {error && (
        <div className="alternate-alert" style={{ marginTop: 14 }}>
          <AlertTriangle size={16} />
          <div>
            <b>Optimisation unavailable</b>
            <p>{error}</p>
          </div>
        </div>
      )}

      {result && best && (
        <>
          <section className="featured-route" style={{ marginTop: 14 }}>
            <div>
              <div className="panel-label">AI / MODEL OUTPUT</div>
              <h2>{best.name}</h2>

              <div className="route-line">
                <span>{result.port}</span>
                <i />
                <Ship size={14} />
                <span>{best.class}</span>
              </div>
            </div>

            <div className="route-stats">
              <div>
                <small>MODEL SCORE</small>
                <b>{Number(best.optimisation_score).toFixed(1)}</b>
              </div>
              <div>
                <small>ETA</small>
                <b>{Number(best.eta_days).toFixed(1)}d</b>
              </div>
              <div>
                <small>COST / MT</small>
                <b>{money(best.cost_per_mt)}</b>
              </div>
              <div>
                <small>CAPACITY</small>
                <b>{num(best.capacity_mt)} MT</b>
              </div>
            </div>
          </section>

          <section className="panel" style={{ marginTop: 14 }}>
            <div className="panel-head">
              <div>
                <h3>Port Constraints</h3>
              </div>
              <span className="live-tag"><span /> PORT DATA</span>
            </div>

            <div className="index-grid">
              <div>
                <small>MAX DRAFT</small>
                <b>{Number(maxDraft || 0).toFixed(1)} m</b>
              </div>

              <div>
                <small>MAX LOA</small>
                <b>{Number(maxLoa || 0).toFixed(0)} m</b>
              </div>

              <div>
                <small>MAX BEAM</small>
                <b>{Number(maxBeam || 0).toFixed(1)} m</b>
              </div>

              <div>
                <small>PORT CONGESTION</small>
                <b>{Number(queued || 0)} queued · {Number(berths || 0)} berths</b>
              </div>
            </div>

          </section>

          <section className="panel" style={{ marginTop: 14 }}>
            <div className="panel-head">
              <div>
                <h3>Vessel ranking</h3>
                <p>Ranked alternatives for the same port and cargo.</p>
              </div>
              <span className="live-tag">
                <span /> MODEL RANKING
              </span>
            </div>

            <div className="rank-list">
              {rows.map((v) => (
                <div
                  className={`rank-item ${v.rank === 1 ? "selected" : ""}`}
                  key={`${v.name}-${v.rank}`}
                >
                  <div className="rank-num">#{v.rank}</div>

                  <div className="rank-main">
                    <h3>{v.name}</h3>
                    <span>
                      {v.class} · {num(v.dwt_mt)} DWT ·{" "}
                      {Number(v.draft_m).toFixed(1)} m draft
                    </span>
                  </div>

                  <div>
                    <small>CAPACITY</small>
                    <b>{num(v.capacity_mt)} MT</b>
                  </div>

                  <div>
                    <small>SHIPMENTS</small>
                    <b>{v.shipments_needed}</b>
                  </div>

                  <div>
                    <small>ETA</small>
                    <b>{Number(v.eta_days).toFixed(1)}d</b>
                  </div>

                  <div>
                    <small>COST / MT</small>
                    <b>{money(v.cost_per_mt)}</b>
                  </div>

                  <div>
                    <small>SCORE</small>
                    <b>{Number(v.optimisation_score).toFixed(1)}</b>
                  </div>
                </div>
              ))}

              {!rows.length && (
                <div className="empty">No feasible vessel returned.</div>
              )}
            </div>
          </section>
        </>
      )}



    </div>
  );
}
