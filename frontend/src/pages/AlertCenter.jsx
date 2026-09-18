/**
 * Alert Center — derived from delayed consignments, weather, market, inventory.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../api';
import PageHead from '../components/PageHead';

export default function AlertCenter({ auth }) {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const plant = auth?.manager?.plant || 'RSP';
    api(`/api/alerts?plant_code=${encodeURIComponent(plant)}`)
      .then((d) => setAlerts(d.alerts || []))
      .catch(() => setAlerts([]));
  }, [auth?.manager?.plant]);

  return (
    <div className="page">
      <PageHead
        eyebrow="ALERT CENTER"
        title="Actions that need attention now."
        desc="Consignment delays, weather risk, market moves and inventory urgency."
      />
      <div className="alert-list">
        {alerts.map((a, i) => (
          <div className={`alert-card ${a.severity || 'medium'}`} key={i}>
            <div className="alert-icon"><AlertTriangle size={18} /></div>
            <div>
              <small style={{ color: 'var(--muted)', fontSize: 10 }}>{a.type}</small>
              <h3>{a.title}</h3>
              <p>{a.impact}</p>
              <p style={{ color: 'var(--blue)' }}>{a.action}</p>
            </div>
          </div>
        ))}
        {alerts.length === 0 && (
          <div className="panel">
            <p style={{ color: 'var(--muted)' }}>No active alerts for this plant.</p>
          </div>
        )}
      </div>
    </div>
  );
}
