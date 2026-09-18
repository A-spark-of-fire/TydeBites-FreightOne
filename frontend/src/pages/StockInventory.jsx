/**
 * Stock & Inventory — varied cover, stock index, urgency
 */
import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmt } from '../utils/format';
import PageHead from '../components/PageHead';

export default function StockInventory({ auth }) {
  const [data, setData] = useState({ items: [], plant: '' });

  useEffect(() => {
    const plant = auth?.manager?.plant || 'RSP';
    api(`/api/inventory?plant_code=${encodeURIComponent(plant)}`)
      .then(setData)
      .catch(() => setData({ items: [], plant: '' }));
  }, [auth?.manager?.plant]);

  return (
    <div className="page">
      <PageHead
        eyebrow="STOCK & INVENTORY"
        title={data.plant || 'Plant inventory'}
        desc="Cover, stock index vs safety, incoming consignments and ordering urgency."
      />
      <div className="inventory-grid">
        {(data.items || []).map((item) => (
          <div className="inventory-card" key={item.id}>
            <small style={{ color: 'var(--muted)' }}>{item.rating}</small>
            <h3>{item.material}</h3>
            <div className="urgency">Urgency {item.urgency_index}/10</div>
            <div className="stock-number">
              {fmt(item.stock_mt)} <span>MT</span>
            </div>
            <div className="inventory-metrics">
              <div>
                <small>STOCK INDEX</small>
                <b>{item.stock_index != null ? item.stock_index : '—'}</b>
              </div>
              <div>
                <small>DAYS COVER</small>
                <b>{item.days_cover}</b>
              </div>
              <div>
                <small>EFFECTIVE</small>
                <b>{item.effective_cover}</b>
              </div>
              <div>
                <small>INCOMING</small>
                <b>{fmt(item.incoming_mt)} MT</b>
              </div>
            </div>
            <div className="stock-bar">
              <span style={{ width: `${Math.min(100, Math.max(6, (item.stock_index || 0) * 50))}%` }} />
            </div>
            <small style={{ color: 'var(--muted)' }}>
              Index 1.0 = safety stock level · now {item.stock_index != null ? item.stock_index : '—'}×
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
