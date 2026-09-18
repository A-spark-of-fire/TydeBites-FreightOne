/**
 * Port Optimizer — ranks destination ports by cost / time / risk / history.
 */
import { useEffect, useState } from 'react';
import { api } from '../api';
import { money, fmt } from '../utils/format';
import PageHead from '../components/PageHead';
import Field from '../components/Field';

export default function PortOptimizer({ auth }) {
  const [refs, setRefs] = useState({ materials: {}, origins: {}, ports: {} });
  const [material, setMaterial] = useState('coking_coal');
  const [origin, setOrigin] = useState('australia');
  const [qty, setQty] = useState(80000);
  const [priority, setPriority] = useState(50);
  const [deadline, setDeadline] = useState(45);
  const [minQuality, setMinQuality] = useState(80);
  const [sourceRanked, setSourceRanked] = useState([]);
  const [ranked, setRanked] = useState([]);
  const [best, setBest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api('/api/refs').then(setRefs).catch(() => {});
  }, []);

  async function run() {
    setLoading(true);
    setMessage('');
    try {
      const data = await api('/api/optimizer', {
        method: 'POST',
        body: JSON.stringify({
          material,
          origin,
          quantity_mt: Number(qty),
          plant_code: auth?.manager?.plant || 'RSP',
          priority: Number(priority),
          deadline_days: Number(deadline),
          min_quality_index: Number(minQuality),
        }),
      });
      const ranked = data.ranked || [];
      setRanked(ranked);
      setBest(data.best || null);
      setSourceRanked(data.source_ranking || []);
      if (!ranked.length) {
        const rejected = data.rejected_routes || [];
        const sourceIssue = rejected.find((r) => r.origin === origin && !r.source_capable);
        const qualityIssue = rejected.find((r) => r.origin === origin && !r.quality_ok);
        if (sourceIssue) {
          setMessage(`No destination ranking is available for ${sourceIssue.origin_label} because it is not configured to supply ${sourceIssue.material_label}. Select a source that supplies the selected material and run the ranking again.`);
        } else if (qualityIssue) {
          setMessage(`No destination ranking is available from ${qualityIssue.origin_label} for ${qualityIssue.material_label} at the selected quality requirement. The source quality index is ${qualityIssue.quality_index}, below the required minimum of ${Number(minQuality).toFixed(0)}.`);
        } else {
          setMessage('No feasible destination route is available for the selected material, origin and quality requirement. Try another destination-compatible source or reduce the quality threshold.');
        }
      }
    } catch (e) {
      const detail = e.message || '';
      if (detail === 'Cannot reach FreightOne backend.') {
        setMessage('The port ranking service is unavailable right now. Please make sure the FreightOne backend is running, then run the ranking again.');
      } else {
        setMessage(detail || 'The port ranking could not be completed. Please review the selected material, origin and quality requirement and try again.');
      }
      setRanked([]);
      setBest(null);
      setSourceRanked([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <PageHead
        eyebrow="PORT OPTIMISER"
        title="Rank East Coast discharge options."
        desc="Cost, transit time, congestion, draft capability and historic preference are scored together."
        action={
          <button className="primary" onClick={run} disabled={loading}>
            {loading ? 'Scoring…' : 'Run ranking'}
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
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Quantity (MT)">
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Delivery deadline (days)">
            <input
              type="number"
              min="1"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </Field>
          <Field label="Minimum source quality index">
            <input
              type="range"
              min="0"
              max="100"
              value={minQuality}
              onChange={(e) => setMinQuality(+e.target.value)}
            />
          </Field>
          <Field label="Cost ↔ Time priority">
            <input
              type="range"
              min="0"
              max="100"
              value={priority}
              onChange={(e) => setPriority(+e.target.value)}
            />
          </Field>
        </div>
      </section>

      {message && <div className="error" style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5 }}>{message}</div>}

      {best && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>AI preferred route</h3>
              <p>
                {best.port_label} via {best.origin_label} — score {best.score}
              </p>
            </div>
          </div>
          <div className="index-grid">
            <div><small>Landed / MT</small><b>{money(best.total_cost_mt)}</b></div>
            <div><small>Total cost</small><b>{money(best.total_cost)}</b></div>
            <div><small>ETA days</small><b>{best.eta_days}</b></div>
            <div><small>Risk</small><b>{best.risk_score}</b></div>
            <div><small>Congestion</small><b>{best.congestion}</b></div>
            <div><small>Max draft</small><b>{best.max_draft_m} m</b></div>
            <div><small>Deadline</small><b>{best.deadline_status || '—'}</b></div>
            <div><small>Quality</small><b>{best.quality_index ?? '—'}</b></div>
            <div><small>Plant relation</small><b>{Math.round((best.plant_port_relationship?.relationship_index || 0) * 100)}%</b></div>
          </div>
        </section>
      )}

      {ranked.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div><h3>Ranked ports</h3><p>Lower composite score is better.</p></div>
          </div>
          <div className="cons-grid">
            {ranked.map((r) => (
              <div className="cons-card" key={`${r.port}-${r.origin}`}>
                <div className="cons-top">
                  <div>
                    <b>#{r.rank} {r.port_label}</b>
                    <span>{r.origin_label} → {r.plant_code}</span>
                  </div>
                  <em className={`status ${r.rank === 1 ? 'on_schedule' : ''}`}>
                    {r.rank_label}
                  </em>
                </div>
                <div className="cons-metrics">
                  <div><small>Cost / MT</small><b>{money(r.total_cost_mt)}</b></div>
                  <div><small>ETA</small><b>{r.eta_days}d</b></div>
                  <div><small>Risk</small><b>{r.risk_score}</b></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {sourceRanked.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Source screening</h3>
              <p>Source quality and infrastructure are screened before the destination ranking.</p>
            </div>
          </div>
          <div className="cons-grid">
            {sourceRanked.map((r) => (
              <div className="cons-card" key={`source-${r.origin}`}>
                <div className="cons-top">
                  <div>
                    <b>#{r.rank} {r.origin_label}</b>
                    <span>{r.source_port} → {r.port_label}</span>
                  </div>
                  <em className={`status ${r.deadline_pass ? 'on_schedule' : 'delayed'}`}>
                    {r.deadline_pass ? 'Passes deadline' : 'Fails deadline'}
                  </em>
                </div>
                <div className="cons-metrics">
                  <div><small>QUALITY</small><b>{r.quality_index}</b></div>
                  <div><small>TIME</small><b>{r.eta_days}d</b></div>
                  <div><small>COST / MT</small><b>{money(r.total_cost_mt)}</b></div>
                  <div><small>RISK</small><b>{r.risk_score}</b></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
