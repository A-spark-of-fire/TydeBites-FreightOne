/**
 * Freight Intelligence — ML multi-feature forecast, booking window, size/route proxies, weather.
 */
import { useEffect, useState } from 'react';
import { Clock3, CloudRain } from 'lucide-react';
import { api } from '../api';
import PageHead from '../components/PageHead';
import Chart from '../components/Chart';

export default function FreightIntelligence() {
  const [data, setData] = useState(null);
  const [weather, setWeather] = useState(null);
  const [multi, setMulti] = useState(null);
  const [ml, setMl] = useState(null);

  useEffect(() => {
    Promise.allSettled([
      api('/api/freight-intelligence'),
      api('/api/weather'),
      api('/api/multi-forecast?horizon=60'),
      api('/api/ml-forecast?horizon=90'),
    ]).then(([f, w, m, mlRes]) => {
      setData(f.status === 'fulfilled' ? f.value : null);
      setWeather(w.status === 'fulfilled' ? w.value : null);
      setMulti(m.status === 'fulfilled' ? m.value : null);
      setMl(mlRes.status === 'fulfilled' ? mlRes.value : null);
    });
  }, []);

  // Prefer explicit ML payload; fall back to freight-intelligence
  const source = ml || data;
  const history = source?.history || data?.forecast?.history || [];
  const forecastRows = source?.forecast || data?.forecast?.forecast || [];
  const booking = source?.booking_window || data?.booking_window;

  // Chart: last history + forward ML path (with bands on forecast segment)
  const histSlice = (Array.isArray(history) ? history : []).slice(-40).map((r) => ({
    date: r.date,
    bdi: r.bdi,
    low: r.bdi,
    high: r.bdi,
    phase: 'history',
  }));
  const fcSlice = (Array.isArray(forecastRows) ? forecastRows : []).slice(0, 60).map((r) => ({
    date: r.date,
    bdi: r.bdi,
    low: r.low ?? r.bdi,
    high: r.high ?? r.bdi,
    phase: 'forecast',
  }));
  const chart = [...histSlice, ...fcSlice];

  const weatherRisk = weather?.risk || { no_delay: 42, slight: 28, moderate: 20, high: 10 };
  const modelMeta = (typeof source?.model === 'object' ? source.model : null)
    || (typeof data?.model === 'object' ? data.model : null);
  const featureImportance = source?.feature_importance || data?.feature_importance;
  const liveRefresh = source?.live_refresh || data?.live_refresh;
  const trainingPoints = source?.training_points ?? data?.training_points;
  const indices = source?.indices || data?.indices || {};

  return (
    <div className="page">
      <PageHead
        eyebrow="FREIGHT MARKET INTELLIGENCE"
        title="Market signals before the booking window closes."
        desc="ML multi-feature forecast (lags, seasonality, commodity & macro proxies), vessel-class and trade-lane curves, weather exposure."
      />

      <div className="grid two">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>ML forecast path (history + 90-day horizon)</h3>
              <p>
                {modelMeta?.name || 'freight-ml'} · {modelMeta?.model_type || 'multi-feature'}
                {liveRefresh ? ` · live: ${liveRefresh}` : ''}
              </p>
            </div>
          </div>
          <Chart data={chart} showBand height={300} />
          <div className="scenario" style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div><span>Current index</span><strong>{indices.BDI ?? histSlice[histSlice.length - 1]?.bdi ?? '—'}</strong></div>
            <div><span>Day-30 forecast</span><strong>{fcSlice[29]?.bdi ?? fcSlice[Math.min(29, fcSlice.length - 1)]?.bdi ?? '—'}</strong></div>
            <div><span>Day-60 forecast</span><strong>{fcSlice[59]?.bdi ?? fcSlice[Math.min(59, fcSlice.length - 1)]?.bdi ?? '—'}</strong></div>
          </div>
        </section>

        <section className="panel">
          <h3>Recommended booking window</h3>
          <div className="decision buy">
            <div className="decision-icon"><Clock3 size={20} /></div>
            <div>
              <span className="eyebrow">ML TIMING OUTPUT</span>
              <h2>Book around day {booking?.window_start_day && booking?.window_end_day
                ? `${booking.window_start_day}–${booking.window_end_day}`
                : booking?.best_day || '—'}</h2>
              <p>
                The model looks ahead rather than treating today as the booking point. It evaluates the projected freight index across days 10–12 and identifies the softest point in that future window.
                {booking?.expected_savings_percent != null && (
                  <> Estimated relief vs today: {booking.expected_savings_percent}%.</>
                )}
              </p>
              {booking?.best_date && (
                <p style={{ marginTop: 6, fontSize: 13 }}>Predicted low point: <b>{booking.best_date}</b> · expected index ~{booking.expected_bdi}</p>
              )}
              {booking?.confidence_note && (
                <p style={{ marginTop: 4, fontSize: 12, color: '#94a3b8' }}>{booking.confidence_note}</p>
              )}
            </div>
          </div>
          <div className="scenario" style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><span>Capesize proxy</span><strong>{indices.Capesize ?? '—'}</strong></div>
            <div><span>Panamax proxy</span><strong>{indices.Panamax ?? '—'}</strong></div>
            <div><span>Commodity proxy</span><strong>{indices.CommodityProxy ?? '—'}</strong></div>
            <div><span>Macro demand</span><strong>{indices.MacroDemand ?? '—'}</strong></div>
            <div><span>Bunker</span><strong>{indices.Bunker ?? indices.Fuel ?? '—'}</strong></div>
            <div><span>Congestion</span><strong>{indices.Congestion ?? '—'}</strong></div>
          </div>
        </section>
      </div>

      {multi && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="panel-label">VESSEL-CLASS & TRADE-LANE RATE PROXIES</div>
          <div className="scenario" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
            {['Handysize', 'Supramax', 'Panamax', 'Capesize'].map((cls) => {
              const series = multi.by_vessel_class?.[cls] || [];
              const last = series[0] || series[series.length - 1];
              return (
                <div key={cls}>
                  <span>{cls}</span>
                  <strong>{last?.index ?? '—'}</strong>
                </div>
              );
            })}
          </div>
          <div className="scenario" style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
            {Object.entries(multi.by_trade_lane || {}).slice(0, 4).map(([lane, series]) => {
              const last = series?.[0] || series?.[series.length - 1];
              return (
                <div key={lane}>
                  <span>{lane.replace(/-/g, ' → ')}</span>
                  <strong>{last?.index ?? '—'}</strong>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-label">ML PREDICTIVE CONFIGURATION</div>
        <div className="scenario" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
          <div><span>Model</span><strong>{modelMeta?.name || (typeof data?.model === 'string' ? data.model : '—')}</strong></div>
          <div><span>Type</span><strong>{modelMeta?.model_type || '—'}</strong></div>
          <div><span>Live refresh</span><strong>{liveRefresh || '—'}</strong></div>
          <div><span>Training points</span><strong>{trainingPoints ?? '—'}</strong></div>
        </div>
        {featureImportance && (
          <div style={{ marginTop: 10 }}>
            <b>Feature importance</b>
            <div className="scenario" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
              {Object.entries(featureImportance).slice(0, 8).map(([k, v]) => (
                <div key={k}><span>{k}</span><strong>{Math.round(Number(v) * 100)}%</strong></div>
              ))}
            </div>
          </div>
        )}
        <p className="reason" style={{ marginTop: 8 }}>
          Forecast uses lagged freight levels, weekly seasonality, commodity and macro proxies, ensembled with a Holt baseline for stability.
        </p>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div>
            <h3>Bay of Bengal — wave & hazard forecast</h3>
            <p>{weather?.region || 'Bay of Bengal'} · {weather?.status || 'Operational'}
              {weather?.current_wave_height_m != null && <> · current wave ~{weather.current_wave_height_m} m</>}
            </p>
          </div>
          <CloudRain size={18} />
        </div>
        <Chart
          data={(weather?.series || []).map((r) => ({
            date: r.date || String(r.day),
            bdi: r.risk,
            low: r.wave_m != null ? r.wave_m * 15 : r.risk,
            high: r.risk,
          }))}
          height={220}
          showBand
        />
        <div className="scenario" style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><span>No delay</span><strong>{weatherRisk.no_delay ?? weatherRisk.green ?? '—'}%</strong></div>
          <div><span>Slight</span><strong>{weatherRisk.slight ?? weatherRisk.yellow ?? '—'}%</strong></div>
          <div><span>Moderate</span><strong>{weatherRisk.moderate ?? weatherRisk.orange ?? '—'}%</strong></div>
          <div><span>High</span><strong>{weatherRisk.high ?? weatherRisk.red ?? '—'}%</strong></div>
        </div>
        <p className="reason" style={{ marginTop: 8 }}>
          Chart shows corridor hazard index over the forecast horizon (lower is calmer). Softened for operational planning.
        </p>
      </section>
    </div>
  );
}
