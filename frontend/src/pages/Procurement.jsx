/**
 * Procurement Planner — full chartering decision support
 * Inputs: material, origin, qty, deadline, preferred port, cost↔time priority
 * Outputs: BEST (AI) vs manager preference, idle, printable official plan
 * Layer-2 plant access verification retained
 */
import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmt, money } from '../utils/format';
import PageHead from '../components/PageHead';
import Field from '../components/Field';
import Chart from '../components/Chart';

export default function Procurement({ auth }) {
  const [refs, setRefs] = useState({ materials: {}, ports: {}, origins: {} });
  const [material, setMaterial] = useState('coking_coal');
  const [origin, setOrigin] = useState('australia');
  const [qty, setQty] = useState(80000);
  const [deadline, setDeadline] = useState(45);
  const [port, setPort] = useState('paradip');
  const [priority, setPriority] = useState(55);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [plantAccessCode, setPlantAccessCode] = useState(
    auth?.plantAccessCode || auth?.security?.plant_access_code_prefill || auth?.manager?.plant || 'RSP'
  );
  const [layer2Unlocked, setLayer2Unlocked] = useState(false);
  const [forecastChart, setForecastChart] = useState([]);

  useEffect(() => {
    setPlantAccessCode(
      auth?.plantAccessCode || auth?.security?.plant_access_code_prefill || auth?.manager?.plant || 'RSP'
    );
  }, [auth]);

  useEffect(() => {
    api('/api/refs').then((d) => setRefs(d || {})).catch(() => {});
    api('/api/ml-forecast?horizon=45')
      .then((fc) => {
        const hist = (fc.history || []).slice(-15).map((r) => ({
          date: r.date, bdi: r.bdi, low: r.bdi, high: r.bdi,
        }));
        const fut = (fc.forecast || []).slice(0, 30).map((r) => ({
          date: r.date, bdi: r.bdi, low: r.low ?? r.bdi, high: r.high ?? r.bdi,
        }));
        setForecastChart([...hist, ...fut]);
      })
      .catch(() => {});
  }, []);

  async function verifyLayer2() {
    try {
      await api('/api/security/verify-plant', {
        method: 'POST',
        body: JSON.stringify({
          plant_code: auth?.manager?.plant || auth?.plant?.code || 'RSP',
          access_code: plantAccessCode,
        }),
      });
      setLayer2Unlocked(true);
      setMessage('');
      try {
        const saved = JSON.parse(localStorage.getItem('freightone_auth') || '{}');
        saved.plantAccessCode = plantAccessCode;
        localStorage.setItem('freightone_auth', JSON.stringify(saved));
      } catch {}
    } catch (e) {
      setLayer2Unlocked(false);
      setMessage(e.message || 'Access verification failed');
    }
  }

  async function run() {
    if (!layer2Unlocked) {
      setMessage('Verify plant access before generating a plan.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const live = await api('/api/procurement', {
        method: 'POST',
        body: JSON.stringify({
          material,
          origin,
          quantity_mt: Number(qty),
          deadline_days: Number(deadline),
          port,
          plant_code: auth?.manager?.plant || 'RSP',
          priority: Number(priority),
          plant_access_code: plantAccessCode,
        }),
      });
      setResult(live);
    } catch (err) {
      const detail = err.message || '';
      if (detail === 'Cannot reach FreightOne backend.') {
        setMessage('The procurement planning service is unavailable right now. Please make sure the FreightOne backend is running, then generate the plan again.');
      } else {
        setMessage(detail || 'The procurement plan could not be generated. Please review the selected material, origin and destination and try again.');
      }
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function generateReport() {
    setReportLoading(true);
    setMessage('');
    try {
      const report = await api('/api/procurement-report', {
        method: 'POST',
        body: JSON.stringify({
          material,
          origin,
          quantity: Number(qty),
          deadline: new Date(Date.now() + Number(deadline) * 86400000).toISOString().slice(0, 10),
          priority: priority < 40 ? 'cost' : priority > 65 ? 'time' : 'balanced',
          port,
          plant_code: auth?.manager?.plant || 'RSP',
          manager_name: auth?.manager?.name || 'Manager',
        }),
      });
      const r = report;
      const cb = r.cost_breakdown || {};
      const idle = r.idle_positioning || {};
      const w = window.open('', '_blank', 'width=920,height=720');
      if (!w) {
        setMessage('Popup blocked — allow popups to print the official plan.');
        return;
      }
      w.document.write(`<!DOCTYPE html><html><head><title>${r.title || 'FreightOne Plan'}</title>
        <style>
          body{font-family:system-ui,Segoe UI,sans-serif;padding:36px;line-height:1.5;color:#0f172a}
          h1{font-size:22px;margin:0 0 8px} h2{font-size:16px;margin:28px 0 10px;border-bottom:1px solid #cbd5e1;padding-bottom:4px}
          table{border-collapse:collapse;width:100%;margin:8px 0 16px}
          th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left;font-size:13px}
          th{background:#f1f5f9} .muted{color:#64748b;font-size:12px}
          .sig{margin-top:48px} .box{border:2px solid #16a34a;padding:12px 14px;border-radius:8px;margin:12px 0}
        </style></head><body>
        <h1>${r.title || 'FreightOne — Official Plan'}</h1>
        <p class="muted">Generated: ${r.generated_at || ''} · Plant: ${r.plant_code || ''} · Manager: ${r.manager_name || ''}</p>

        <h2>Request</h2>
        <table>
          <tr><th>Material</th><td>${r.request?.material || material}</td></tr>
          <tr><th>Quantity</th><td>${Number(r.request?.quantity_mt || qty).toLocaleString()} MT</td></tr>
          <tr><th>Origin</th><td>${r.request?.origin || origin}</td></tr>
          <tr><th>Destination port</th><td>${r.request?.destination_port || port}</td></tr>
          <tr><th>Deadline</th><td>${r.request?.deadline || deadline + ' days'}</td></tr>
          <tr><th>Priority</th><td>${r.request?.priority || ''}</td></tr>
        </table>

        <h2>Recommended plan (AI)</h2>
        <div class="box">
          <table>
            <tr><th>Contract</th><td>${r.recommendation?.preferred_contract || '—'}</td></tr>
            <tr><th>Vessel class</th><td>${r.recommendation?.vessel_class || '—'}</td></tr>
            <tr><th>Voyages / vessels</th><td>${r.recommendation?.voyages || '—'}</td></tr>
            <tr><th>Entry window</th><td>${r.recommendation?.entry_window || '—'}</td></tr>
            <tr><th>Best entry date</th><td>${r.recommendation?.best_entry_date || '—'}</td></tr>
            <tr><th>Expected saving vs spot</th><td>${r.recommendation?.expected_savings_pct ?? '—'}%</td></tr>
            <tr><th>Reason</th><td>${r.recommendation?.reason || '—'}</td></tr>
          </table>
        </div>

        <h2>Cost breakdown</h2>
        <table>
          <tr><th>Sea freight / MT</th><td>${cb.sea_freight_mt != null ? Number(cb.sea_freight_mt).toFixed(2) : '—'}</td></tr>
          <tr><th>Port / ship handling / MT</th><td>${cb.port_handling_mt != null ? Number(cb.port_handling_mt).toFixed(2) : '—'}</td></tr>
          <tr><th>Port charges / MT</th><td>${cb.port_charges_mt != null ? Number(cb.port_charges_mt).toFixed(2) : '—'}</td></tr>
          <tr><th>Port → plant (inland) / MT</th><td>${cb.inland_to_plant_mt != null ? Number(cb.inland_to_plant_mt).toFixed(2) : '—'}</td></tr>
          <tr><th>Other / MT</th><td>${cb.other_charges_mt != null ? Number(cb.other_charges_mt).toFixed(2) : '—'}</td></tr>
          <tr><th>Total landed / MT</th><td><b>${cb.total_cost_mt != null ? Number(cb.total_cost_mt).toFixed(2) : '—'}</b></td></tr>
          <tr><th>Total landed</th><td><b>${cb.total_cost != null ? Number(cb.total_cost).toLocaleString() : '—'}</b></td></tr>
          <tr><th>ETA (days)</th><td>${cb.eta_days ?? '—'}</td></tr>
          <tr><th>Risk score</th><td>${cb.risk_score ?? '—'}</td></tr>
        </table>

        <h2>Voyage / consignment schedule</h2>
        <table>
          <tr><th>Voyage</th><th>Approx tonnage (MT)</th><th>Approx ETA (days)</th></tr>
          ${(r.voyage_schedule || []).map((v) =>
            `<tr><td>${v.voyage}</td><td>${Number(v.approx_tonnage_mt).toLocaleString()}</td><td>${v.approx_eta_days}</td></tr>`
          ).join('') || '<tr><td colspan="3">Single voyage / see plan</td></tr>'}
        </table>

        <h2>Route allocation</h2>
        <table>
          <tr><th>Rank</th><th>Origin</th><th>Destination</th><th>Allocation (MT)</th><th>Reason</th></tr>
          ${(r.route_plan || []).map((v) =>
            `<tr><td>${v.route_rank}</td><td>${v.origin}</td><td>${v.port}</td><td>${Number(v.allocation_mt || 0).toLocaleString()}</td><td>${v.reason || ''}</td></tr>`
          ).join('') || '<tr><td colspan="5">Single primary route</td></tr>'}
        </table>

        <h2>Idle & positioning</h2>
        <p>${(r.idle_advice && r.idle_advice[0]) || idle.recommendation || '—'}</p>
        ${idle.best_reposition ? `<table>
          <tr><th>Best reposition region</th><td>${String(idle.best_reposition.target_region || '').replace(/_/g, ' ')}</td></tr>
          <tr><th>Ballast (nm)</th><td>${idle.best_reposition.ballast_nm ?? '—'}</td></tr>
          <tr><th>Steam days</th><td>${idle.best_reposition.steam_days ?? '—'}</td></tr>
          <tr><th>Est. cost (USD)</th><td>${Number(idle.best_reposition.est_cost_usd || 0).toLocaleString()}</td></tr>
        </table>` : ''}
        <ul>${((idle.alternative_employment) || []).map((o) =>
          `<li>${String(o.target_region || '').replace(/_/g, ' ')} — $${Number(o.est_cost_usd || 0).toLocaleString()} (${o.steam_days}d)</li>`
        ).join('')}</ul>

        <h2>Risk flags</h2>
        <ul>${(r.risk_flags || []).map((f) => `<li>${f}</li>`).join('') || '<li>None flagged</li>'}</ul>

        <div class="sig">
          <p><b>Prepared by:</b> ${r.signature_block?.prepared_by || 'FreightOne'}</p>
          <p><b>Manager:</b> ${r.signature_block?.manager_name || ''} &nbsp;&nbsp; <b>Date:</b> ${r.signature_block?.date || ''}</p>
          <p style="margin-top:36px">${r.signature_block?.signature_line || '_______________________________'}</p>
          <p class="muted">${r.disclaimer || ''}</p>
        </div>
        <script>window.onload=()=>setTimeout(()=>window.print(),400)</script>
        </body></html>`);
      w.document.close();
    } catch (err) {
      setMessage(err.message || 'Report generation failed');
    } finally {
      setReportLoading(false);
    }
  }

  const selected = result?.selected;
  const ai = result?.ai;
  const best = result?.best_overall;
  const charter = result?.charter;

  return (
    <div className="page">
      <PageHead
        eyebrow="PROCUREMENT & CHARTERING"
        title="Plan the next bulk cargo booking."
        desc="Material, origin, quantity, deadline and cost↔time priority — AI best plan vs manager preference, with official printable documentation."
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="primary" onClick={run} disabled={loading || !layer2Unlocked}>
              {loading ? 'Running…' : 'Generate plan'}
            </button>
            {result && (
              <button className="primary" onClick={generateReport} disabled={reportLoading} style={{ background: '#0f766e' }}>
                {reportLoading ? 'Building…' : 'Official plan document'}
              </button>
            )}
          </div>
        }
      />

      {/* Layer-2 verification — retained */}
      <section className="panel" style={{ borderLeft: '4px solid #b45309' }}>
        <div className="panel-label">PLANT ACCESS VERIFICATION</div>
        <div className="scenario" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <span>Plant</span>
            <strong>{auth?.plant?.name || auth?.manager?.plant_name || 'Rourkela Steel Plant'}</strong>
          </div>
          <div>
            <span>Access code</span>
            <input
              value={plantAccessCode}
              onChange={(e) => { setPlantAccessCode(e.target.value); setLayer2Unlocked(false); }}
              style={{ width: '100%', padding: '6px 8px' }}
            />
          </div>
        </div>
        <button className="secondary" type="button" style={{ marginTop: 8 }} onClick={verifyLayer2}>
          {layer2Unlocked ? 'Access verified ✓' : 'Verify access'}
        </button>
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="form-grid">
          <Field label="Material">
            <select value={material} onChange={(e) => setMaterial(e.target.value)}>
              {Object.entries(refs.materials || {}).map(([k, v]) => (
                <option key={k} value={k}>{v.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Source / Origin">
            <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
              {Object.entries(refs.origins || {}).map(([k, v]) => (
                <option key={k} value={k}>{v.label || k}</option>
              ))}
            </select>
          </Field>
          <Field label="Quantity (MT)">
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Delivery deadline (days)">
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
            <b>Priority — Cost ↔ Time</b>
            <small>Near deadlines favour faster entry; longer horizons use forecast windows.</small>
          </div>
          <div className="priority-control">
            <span>Cost</span>
            <input type="range" min="0" max="100" value={priority} onChange={(e) => setPriority(+e.target.value)} />
            <span>Deadline</span>
          </div>
        </div>
      </section>

      {message && <div className="error" style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5 }}>{message}</div>}

      {forecastChart.length > 0 && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="panel-label">FREIGHT INDEX PATH</div>
          <Chart data={forecastChart} showBand height={200} />
        </section>
      )}

      {result && (
        <>
          {/* BEST — green border */}
          <section className="panel" style={{ marginTop: 16, border: '2px solid #22c55e', borderRadius: 10 }}>
            <div className="panel-label" style={{ color: '#16a34a' }}>BEST PLAN (AI)</div>
            <div className="scenario" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
              <div><span>Origin → Destination</span><strong>{ai?.origin_label || origin} → {ai?.preferred_port || best?.port_label || '—'}</strong></div>
              <div><span>Vessel class</span><strong>{ai?.vessel_class || '—'}</strong></div>
              <div><span>Voyages / vessels</span><strong>{ai?.voyages_needed ?? charter?.voyages_needed ?? '—'}</strong></div>
              <div><span>Contract</span><strong>{ai?.preferred_contract || charter?.preferred_contract || '—'}</strong></div>
              <div><span>Entry window</span><strong>{ai?.entry_window || charter?.entry_window || '—'}</strong></div>
              <div><span>Landed cost / MT</span><strong>{best ? money(best.total_cost_mt) : '—'}</strong></div>
              <div><span>Total landed</span><strong>{best?.total_cost != null ? money(best.total_cost) : '—'}</strong></div>
              <div><span>ETA</span><strong>{ai?.eta_days ?? best?.eta_days ?? '—'} days</strong></div>
              <div>
                <span>vs Deadline</span>
                <strong style={{ color: (ai?.eta_delta_days ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                  {ai?.eta_status || result?.eta_status || '—'}
                </strong>
              </div>
              <div><span>Risk</span><strong>{best?.risk_score ?? '—'}</strong></div>
              <div><span>Urgency / cover</span><strong>{ai?.urgency_index ?? '—'}/10 · {ai?.days_of_cover ?? '—'}d</strong></div>
              <div><span>Quality (origin)</span><strong>{best?.quality_index ?? '—'}</strong></div>
            </div>
            <p className="reason" style={{ marginTop: 10 }}>{ai?.charter_reason || ai?.recommendation}</p>
            {(ai?.risk_flags || []).length > 0 && (
              <div style={{ marginTop: 6, fontSize: 13 }}><b>Risk flags:</b> {ai.risk_flags.join(' · ')}</div>
            )}
          </section>

          <div className="grid two" style={{ marginTop: 16 }}>
            <section className="panel preference">
              <div className="panel-label">MANAGER PREFERENCE</div>
              <div className="scenario">
                <b>{selected?.port_label || port}</b>
                <div><span>Origin</span><strong>{selected?.origin_label || origin}</strong></div>
                <div><span>Quantity</span><strong>{fmt(selected?.quantity_mt || qty)} MT</strong></div>
                <div><span>Deadline</span><strong>{deadline} days</strong></div>
                <div><span>Landed cost / MT</span><strong>{selected?.total_cost_mt != null ? money(selected.total_cost_mt) : '—'}</strong></div>
                <div><span>Total landed</span><strong>{selected?.total_cost != null ? money(selected.total_cost) : '—'}</strong></div>
                <div><span>ETA</span><strong>{selected?.eta_days ?? '—'} days</strong></div>
                <div><span>Risk</span><strong>{selected?.risk_score ?? '—'}</strong></div>
              </div>
            </section>

            <section className="panel model">
              <div className="panel-label">AI SUMMARY</div>
              <div className="scenario">
                <b>{ai?.preferred_port || best?.port_label || '—'}</b>
                <div><span>Vessel × voyages</span><strong>{ai?.vessel_class || '—'} × {ai?.voyages_needed ?? '—'}</strong></div>
                <div><span>Contract</span><strong>{ai?.preferred_contract || '—'}</strong></div>
                <div><span>Saving vs spot</span><strong>{ai?.expected_savings_pct != null ? `${ai.expected_savings_pct}%` : '—'}</strong></div>
              </div>
              <p className="reason">{ai?.recommendation}</p>
            </section>
          </div>

          {/* Idle — kept on Procurement as requested */}
          {(charter?.idle_positioning || (ai?.idle_advice || []).length > 0) && (
            <section className="panel" style={{ marginTop: 16 }}>
              <div className="panel-label">IDLE & POSITIONING</div>
              <div className="scenario">
                {charter?.idle_positioning ? (
                  <>
                    <div><span>Soft-demand ratio</span><strong>{Math.round((charter.idle_positioning.soft_demand_ratio || 0) * 100)}%</strong></div>
                    {charter.idle_positioning.soft_window && (
                      <div>
                        <span>Soft window</span>
                        <strong>Day {charter.idle_positioning.soft_window.start_day}–{charter.idle_positioning.soft_window.end_day}</strong>
                      </div>
                    )}
                    <p className="reason">{charter.idle_positioning.recommendation}</p>
                    {charter.idle_positioning.best_reposition && (
                      <div style={{ marginTop: 8 }}>
                        <b>Best reposition:</b>{' '}
                        {String(charter.idle_positioning.best_reposition.target_region || '').replace(/_/g, ' ')}
                        {' · $'}{Number(charter.idle_positioning.best_reposition.est_cost_usd || 0).toLocaleString()}
                        {' · '}{charter.idle_positioning.best_reposition.steam_days}d
                      </div>
                    )}
                    {(charter.idle_positioning.alternative_employment || []).slice(0, 3).map((opt, i) => (
                      <div key={i} style={{ fontSize: 13, marginTop: 4 }}>
                        {String(opt.target_region || '').replace(/_/g, ' ')} — ${Number(opt.est_cost_usd || 0).toLocaleString()} ({opt.steam_days}d)
                      </div>
                    ))}
                  </>
                ) : (
                  <ul style={{ margin: '4px 0 0 16px' }}>
                    {(ai?.idle_advice || []).map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                )}
              </div>
            </section>
          )}

          {charter?.contract_comparison && (
            <section className="panel" style={{ marginTop: 16 }}>
              <div className="panel-label">SPOT vs MULTI-VOYAGE vs SHORT TC</div>
              <div className="scenario">
                {charter.contract_comparison.map((row, i) => (
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
