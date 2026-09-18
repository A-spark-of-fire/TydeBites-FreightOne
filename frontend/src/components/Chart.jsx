/**
 * Reusable AreaChart for BDI / freight series.
 * Supports optional low/high confidence band fields.
 */
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line,
} from 'recharts';

export default function Chart({ data = [], height = 280, showBand = false }) {
  const rows = Array.isArray(data) ? data : [];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows}>
        <defs>
          <linearGradient id="bdiFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4d95ef" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#4d95ef" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#2d3e5b" strokeDasharray="4 4" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#90a3bd', fontSize: 10 }}
          tickFormatter={(v) => (v ? String(v).slice(5) : '')}
        />
        <YAxis tick={{ fill: '#90a3bd', fontSize: 10 }} domain={['auto', 'auto']} />
        <Tooltip
          contentStyle={{ background: '#111f35', border: '1px solid #2a3d5f', borderRadius: 8 }}
          labelStyle={{ color: '#91a4bf' }}
        />
        {showBand && (
          <Area
            type="monotone"
            dataKey="high"
            stroke="transparent"
            fill="url(#bandFill)"
            strokeWidth={0}
            dot={false}
          />
        )}
        <Area
          type="monotone"
          dataKey="bdi"
          stroke="#4d95ef"
          fill="url(#bdiFill)"
          strokeWidth={2}
          dot={false}
          name="Index"
        />
        {showBand && (
          <Line type="monotone" dataKey="low" stroke="#64748b" strokeDasharray="4 4" dot={false} strokeWidth={1} name="Low" />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
