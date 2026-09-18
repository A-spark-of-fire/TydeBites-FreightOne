/**
 * KPI card used in Command Center and Executive Report.
 * tone: 'blue' | 'orange' | 'green' (affects icon background via CSS)
 */
export default function KPI({ label, value, sub, icon: Icon, tone = 'blue' }) {
  return (
    <div className={`kpi ${tone}`}>
      <div className="kpi-icon">{Icon && <Icon size={18} />}</div>
      <div>
        <small>{label}</small>
        <b>{value}</b>
        <span>{sub}</span>
      </div>
    </div>
  );
}
