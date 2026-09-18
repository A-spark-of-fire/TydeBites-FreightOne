/**
 * Command Center — primary dashboard.
 * Data is loaded live from:
 *   /api/forecast, /api/risk-score, /api/consignments, /api/inventory
 * Visual layout and CSS classes are unchanged from the original design.
 */
import { useEffect, useState } from 'react';
import {
  Ship, Bell, Package, BrainCircuit, RefreshCw, ChevronRight,
} from 'lucide-react';
import { api } from '../api';
import PageHead from '../components/PageHead';
import KPI from '../components/KPI';
import Chart from '../components/Chart';
import { getGreeting } from '../utils/greetingHelper';

export default function CommandCenter({ auth, setPage }) {
  const [forecast, setForecast] = useState({ history: [], forecast: [] });
  const [risk, setRisk] = useState({ risk_score: 68, risk_level: 'amber', items: [] });
  const [cons, setCons] = useState([]);
  const [signal, setSignal] = useState({ value: 'MONITOR', sub: 'Loading…' });
  const [news, setNews] = useState([]);

  useEffect(() => {
    let alive = true;
    const plant = auth?.manager?.plant || 'RSP';

    Promise.allSettled([
      api('/api/forecast'),
      api('/api/risk-score'),
      api(`/api/consignments?plant_code=${encodeURIComponent(plant)}`),
      api(`/api/inventory?plant_code=${encodeURIComponent(plant)}`),
      api('/api/news'),
    ]).then(([f, r, c, inv, n]) => {
      if (!alive) return;
      if (f.status === 'fulfilled' && f.value) setForecast(f.value);
      if (r.status === 'fulfilled' && r.value) setRisk(r.value);
      if (c.status === 'fulfilled' && Array.isArray(c.value?.consignments)) {
        setCons(c.value.consignments);
      }
      if (n.status === 'fulfilled' && Array.isArray(n.value?.items)) setNews(n.value.items.slice(0, 4));
      if (inv.status === 'fulfilled' && inv.value?.items) {
        // Derive a simple procurement signal from highest urgency item
        const items = inv.value.items;
        const critical = items.filter((i) => i.urgency_index >= 8);
        const watch = items.filter((i) => i.urgency_index >= 5);
        if (critical.length) {
          setSignal({
            value: 'BUY WINDOW',
            sub: `${critical[0].material} cover critical`,
          });
        } else if (watch.length) {
          setSignal({ value: 'MONITOR', sub: 'Freight / weather review needed' });
        } else {
          setSignal({ value: 'HOLD', sub: 'Cover adequate' });
        }
      }
    });

    return () => { alive = false; };
  }, [auth?.manager?.plant]);

  const chart = [
    ...(Array.isArray(forecast?.history) ? forecast.history.slice(-30) : []),
    ...(Array.isArray(forecast?.forecast) ? forecast.forecast.slice(0, 45) : []),
  ];
  const delayed = cons.filter(
    (c) => String(c.status || '').toLowerCase() === 'delayed',
  ).length;
  const active = cons.filter(
    (c) => !['future', 'delivered'].includes(String(c.status || '').toLowerCase()),
  ).length;

  return (
    <div className="page">
      <div 
        onClick={() => setPage('report')} 
        style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
        className="welcome-header-clickable">
      <PageHead 
        eyebrow="COMMAND CENTER ↗ (View Executive Report)" 
        title={`${typeof getGreeting === 'function' ? getGreeting() : 'Good morning'}, ${auth.plant.name}`} 
        desc="One view across procurement, freight, route risk and live shipments. Click anywhere on this header to view the Executive Report." 
        action={
          <button 
            className="secondary" 
            onClick={(e) => { 
              e.stopPropagation(); // Prevents page redirection when clicking the refresh button!
              window.location.reload(); 
            }}>
            <RefreshCw size={14} /> Refresh intelligence
          </button>
        } 
      />
      </div>

      <section className="kpis">
        <KPI
          label="ACTIVE CONSIGNMENTS"
          value={active}
          sub={`${delayed} delayed`}
          icon={Ship}
        />
        <KPI
          label="NETWORK RISK"
          value={risk ? `${risk.risk_score}/100` : '—'}
          sub={risk?.risk_level || 'Loading'}
          icon={Bell}
          tone="orange"
        />
        <KPI
          label="LIVE MATERIAL"
          value="Coking Coal"
          sub="Primary lane"
          icon={Package}
          tone="orange"
        />
        <KPI
          label="AI PROCUREMENT SIGNAL"
          value={signal.value}
          sub={signal.sub}
          icon={BrainCircuit}
          tone="green"
        />
      </section>

      <div className="grid two">
        <section className="panel hover-glow" onClick={() => setPage('freight')} 
                  style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}>
          <div className="panel-head">
            <div>
              <h3>Freight market intelligence <span style={{ fontSize: '0.8em', color: '#4d95ef' }}>↗</span></h3>
              <p>Historical rate trajectory with the current model horizon. Click to expand.</p>
            </div>
            <span className="live-tag"><i />FEED</span>
          </div>
          <Chart data={chart} />
        </section>

        <section className="panel">
          <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>Live intelligence</h3>
            <p>AI procurement action and freight / weather / maritime signals.</p>
          </div>
        <button 
      className="secondary small" 
      onClick={() => setPage('alerts')}
      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          Alert Center <ChevronRight size={14} />
    </button>
  </div>
          <div className="decision hold">
            <div className="decision-icon"><BrainCircuit size={20} /></div>
            <div>
              <span className="eyebrow">AI PROCUREMENT SIGNAL</span>
              <h2>{signal.value === 'BUY WINDOW' ? 'Act — cover risk' : signal.value === 'HOLD' ? 'Hold — cover healthy' : 'Monitor — no immediate buy'}</h2>
              <p>
                {signal.sub}. Freight and weather exposure should be reviewed before the next booking window.
              </p>
            </div>
          </div>
          <div className="news-list">
            {news.map((n, i) => (
              <div className="news-item" key={n.id || i}>
                <b>{n.title}</b>
                <span>{n.category || 'FEED'}</span>
                <small>{Array.isArray(n.tags) ? n.tags.join(' · ') : n.source || 'FreightOne feed'} · {n.source || 'FreightOne feed'}</small>
              </div>
            ))}
            {!news.length && <div className="empty">No freight, weather or maritime headlines loaded.</div>}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Current consignments</h3>
            <p>Vessel → port → plant. Delayed shipments open the recovery path.</p>
          </div>
          <button className="secondary small" onClick={() => setPage('tracker')}>
            Open tracker <ChevronRight size={14} />
          </button>
        </div>
        <div className="cons-grid">
          {cons
            .filter((c) => String(c.status).toLowerCase() !== 'future')
            .slice(0, 4)
            .map((c) => (
              <div className="cons-card" key={c.id}>
                <div className="cons-top">
                  <div>
                    <b>{c.id}</b>
                    <span>
                      {c.material_label || c.material || 'Material'} ·{' '}
                      {c.origin_label || c.origin} → {c.port_label || c.port}
                    </span>
                  </div>
                  <em
                    className={`status ${
                      String(c.status).toLowerCase() === 'delayed'
                        ? 'delayed'
                        : 'on_schedule'
                    }`}
                  >
                    {String(c.status).toLowerCase() === 'delayed'
                      ? `Delayed ${c.delay_days || 0}d`
                      : c.status || 'On schedule'}
                  </em>
                </div>
                <div className="route-line">
                  <Ship size={13} /><i />Port<i />Plant
                </div>
                <div className="cons-metrics">
                  <div>
                    <small>Port ETA</small>
                    <b>{c.eta_port_date || c.port_eta || '—'}</b>
                  </div>
                  <div>
                    <small>Dispatch</small>
                    <b>{c.earliest_dispatch_from_port || c.earliest_dispatch || '—'}</b>
                  </div>
                  <div>
                    <small>Final arrival</small>
                    <b>{c.expected_final_arrival || c.final_arrival || '—'}</b>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
