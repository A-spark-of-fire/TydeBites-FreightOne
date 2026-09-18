/**
 * Executive Report — summary KPIs + priority decisions.
 */
import { useEffect, useState } from 'react';
import { api } from '../api';
import PageHead from '../components/PageHead';

export default function ExecutiveReport({ auth }) {
  const [report, setReport] = useState(null);

  useEffect(() => {
    const plant = auth?.manager?.plant || 'RSP';
    api(`/api/executive-report?plant_code=${encodeURIComponent(plant)}`)
      .then(setReport)
      .catch(() => setReport(null));
  }, [auth?.manager?.plant]);

  const s = report?.summary || {};

  return (
    <div className="page">
      <PageHead
        eyebrow="EXECUTIVE REPORT"
        title="Priority decisions for leadership."
        desc={`Generated ${report?.generated_on || '—'} · ${report?.plant || ''}`}
      />
      <div className="report-hero">
        <div>
          <small>NETWORK RISK</small>
          <b>{s.network_risk ?? '—'}</b>
        </div>
        <div>
          <small>ACTIVE SHIPS</small>
          <b>{s.active_consignments ?? '—'}</b>
        </div>
        <div>
          <small>DELAYED</small>
          <b>{s.delayed_consignments ?? '—'}</b>
        </div>
        <div>
          <small>INVENTORY WATCH</small>
          <b>{s.inventory_watch ?? '—'}</b>
        </div>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Priority decisions</h3>
            <p>Derived from live consignments, inventory urgency, weather and BDI window.</p>
          </div>
        </div>
        <div className="decision-list">
          {(report?.decisions || []).map((d, i) => (
            <div key={i}>
              <span>#{i + 1}</span>
              <b>{d}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
