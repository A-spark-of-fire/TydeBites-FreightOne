/**
 * What-If Simulation — manager preference vs AI optimised plan with deltas
 */
import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmt, money } from '../utils/format';
import PageHead from '../components/PageHead';
import Field from '../components/Field';

export default function WhatIfSimulation({ auth }) {
  const [refs, setRefs] = useState({ materials: {}, ports: {}, origins: {} });
  const [material, setMaterial] = useState('coking_coal');
  const [origin, setOrigin] = useState('australia');
  const [qty, setQty] = useState(80000);
  const [deadline, setDeadline] = useState(45);
  const [port, setPort] = useState('paradip');
  const [priority, setPriority] = useState(55);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/refs').then(setRefs).catch(() => {});
  }, []);

  async function run() {
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/what-if', {
        method: 'POST',
        body: JSON.stringify({
          material,
          origin,
          quantity_mt: Number(qty),
          deadline_days: Number(deadline),
          port,
          plant_code: auth?.manager?.plant || 'RSP',
          priority: Number(priority),
        }),
      });
      setResult(data);
    } catch (e) {
      setError(e.message || 'Simulation failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const base = result?.base;
  const alt = result?.what_if;
  const diff = result?.difference || {};
  const rec = result?.recommendation;

  function deltaColor(v, invert = false) {
    if (v == null || Number.isNaN(v)) return undefined;
    const good = invert ? v > 0 : v < 0;
    const bad = invert ? v < 0 : v > 0;
    if (good) return '#22c55e';  // brighter green
    if (bad) return '#ef4444';
    return undefined;
  }

  return (
    <div className="page">
      <PageHead
        eyebrow="WHAT-IF SIMULATION"
        title="Manager choice vs AI optimised plan."
        desc="Same cargo constraints — compare cost, time, risk and contract structure side by side."
        action={
          <button className="primary" onClick={run} disabled={loading}>
            {loading ? 'Simulating…' : 'Run simulation'}
          </button>
        }
      />

      <section className="panel">
        <div className="form-grid">
          <Field label="Material">
            <select value={material} onChange={(e) => setMaterial(e.target.value)}>
              {Object.entries(refs.materials || {}).map(([k, v]) => (
                <option key={k} value={k}>{v.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Origin">
            <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
              {Object.entries(refs.origins || {}).map(([k, v]) => (
                <option key={k} value={k}>{v.label || k}</option>
              ))}
            </select>
          </Field>
          <Field label="Quantity (MT)">
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Deadline (days)">
            <input type="number" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
          <Field label="Preferred port (manager)">
            <select value={port} onChange={(e) => setPort(e.target.value)}>
              {Object.entries(refs.ports || {}).map(([k, v]) => (
                <option key={k} value={k}>{v.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="priority-box">
          <div>
            <b>Cost ↔ deadline priority</b>
            <small>Applied to both manager path scoring and AI ranking.</small>
          </div>
          <div className="priority-control">
            <span>Cost</span>
            <input type="range" min="0" max="100" value={priority} onChange={(e) => setPriority(+e.target.value)} />
            <span>Deadline</span>
          </div>
        </div>
      </section>

      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

      {result && (
        <>
          <div className="grid two" style={{ marginTop: 16 }}>
            <section className="panel preference">
              <div className="panel-label">MANAGER CHOICE</div>
              <div className="scenario">
                <b>{base?.port_label || port}</b>
                <div><span>Origin</span><strong>{base?.origin_label || origin}</strong></div>
                <div><span>Landed cost / MT</span><strong>{base?.total_cost_mt != null ? money(base.total_cost_mt) : '—'}</strong></div>
                <div><span>Total landed</span><strong>{base?.total_cost != null ? money(base.total_cost) : '—'}</strong></div>
                <div><span>ETA</span><strong>{base?.eta_days ?? '—'} days</strong></div>
                <div><span>vs Deadline</span><strong>{base?.eta_status || '—'}</strong></div>
                <div><span>Risk</span><strong>{base?.risk_score ?? '—'}</strong></div>
                <div><span>Vessel class</span><strong>{base?.vessel_class || '—'}</strong></div>
                <div><span>Contract</span><strong>{base?.preferred_contract || '—'}</strong></div>
              </div>
            </section>

            <section className="panel model">
              <div className="panel-label">AI OPTIMISED</div>
              <div className="scenario">
                <b>{alt?.port_label || '—'}</b>
                <div><span>Origin</span><strong>{alt?.origin_label || origin}</strong></div>
                <div><span>Landed cost / MT</span><strong>{alt?.total_cost_mt != null ? money(alt.total_cost_mt) : '—'}</strong></div>
                <div><span>Total landed</span><strong>{alt?.total_cost != null ? money(alt.total_cost) : '—'}</strong></div>
                <div><span>ETA</span><strong>{alt?.eta_days ?? '—'} days</strong></div>
                <div><span>vs Deadline</span><strong>{alt?.eta_status || '—'}</strong></div>
                <div><span>Risk</span><strong>{alt?.risk_score ?? '—'}</strong></div>
                <div><span>Vessel class</span><strong>{alt?.vessel_class || rec?.vessel_class || '—'}</strong></div>
                <div><span>Contract</span><strong>{alt?.preferred_contract || rec?.preferred_contract || '—'}</strong></div>
              </div>
            </section>
          </div>

          <section className="panel" style={{ marginTop: 16, borderLeft: '4px solid #0369a1' }}>
            <div className="panel-label">DELTA (AI − MANAGER)</div>
            <div className="scenario" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
              <div>
                <span>Cost / MT</span>
                <strong style={{ color: deltaColor(diff.cost_delta_mt) }}>
                  {diff.cost_delta_mt != null ? `${diff.cost_delta_mt > 0 ? '+' : ''}${money(diff.cost_delta_mt)}` : '—'}
                </strong>
              </div>
              <div>
                <span>Total cost delta</span>
                <strong style={{ color: deltaColor(diff.cost_delta_total) }}>
                  {diff.cost_delta_total != null ? `${diff.cost_delta_total > 0 ? '+' : ''}${money(diff.cost_delta_total)}` : '—'}
                </strong>
              </div>
              <div>
                <span>Time (days)</span>
                <strong style={{ color: deltaColor(diff.time_delta_days) }}>
                  {diff.time_delta_days != null ? `${diff.time_delta_days > 0 ? '+' : ''}${diff.time_delta_days}` : '—'}
                </strong>
              </div>
              <div>
                <span>Risk</span>
                <strong style={{ color: deltaColor(diff.risk_delta) }}>
                  {diff.risk_delta != null ? `${diff.risk_delta > 0 ? '+' : ''}${diff.risk_delta}` : '—'}
                </strong>
              </div>
              <div>
                <span>AI savings vs manager</span>
                <strong style={{ color: (diff.savings_if_ai_pct || 0) > 0 ? '#22c55e' : undefined }}>
                  {diff.savings_if_ai_pct != null ? `${diff.savings_if_ai_pct}%` : '—'}
                </strong>
              </div>
              <div>
                <span>Quantity</span>
                <strong>{fmt(qty)} MT</strong>
              </div>
            </div>
            <p className="reason" style={{ marginTop: 10 }}>
              Negative cost/time/risk delta means the AI path is better on that metric.
              {rec?.entry_window && <> AI entry window: <b>{rec.entry_window}</b>.</>}
            </p>
          </section>

          {(result?.charter?.idle_positioning || result?.recommendation?.idle) && (
            <section className="panel" style={{ marginTop: 16 }}>
              <div className="panel-label">IDLE & POSITIONING</div>
              <div className="scenario">
                {result?.charter?.idle_positioning ? (
                  <>
                    <div><span>Soft-demand ratio</span><strong>{Math.round((result.charter.idle_positioning.soft_demand_ratio || 0) * 100)}%</strong></div>
                    {result.charter.idle_positioning.soft_window && (
                      <div><span>Soft window</span><strong>Day {result.charter.idle_positioning.soft_window.start_day}–{result.charter.idle_positioning.soft_window.end_day}</strong></div>
                    )}
                    <p className="reason">{result.charter.idle_positioning.recommendation}</p>
                    {result.charter.idle_positioning.best_reposition && (
                      <div style={{ marginTop: 8 }}>
                        <b>Best reposition:</b>{' '}
                        {String(result.charter.idle_positioning.best_reposition.target_region || '').replace(/_/g, ' ')}
                        {' · $'}{Number(result.charter.idle_positioning.best_reposition.est_cost_usd || 0).toLocaleString()}
                        {' · '}{result.charter.idle_positioning.best_reposition.steam_days}d
                      </div>
                    )}
                    {(result.charter.idle_positioning.alternative_employment || []).slice(0, 3).map((opt, i) => (
                      <div key={i} style={{ fontSize: 13, marginTop: 4 }}>
                        {String(opt.target_region || '').replace(/_/g, ' ')} — ${Number(opt.est_cost_usd || 0).toLocaleString()} ({opt.steam_days}d)
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="reason">{(result.recommendation.idle || []).join(' ')}</p>
                )}
              </div>
            </section>
          )}

          {result?.charter?.contract_comparison && (
            <section className="panel" style={{ marginTop: 16 }}>
              <div className="panel-label">CONTRACT STRUCTURES</div>
              <div className="scenario">
                {result.charter.contract_comparison.map((row, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <b>{row.structure}</b> — ${Number(row.est_cost_usd || 0).toLocaleString()} · exposure {row.volatility_exposure}/100 · {row.flexibility}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
