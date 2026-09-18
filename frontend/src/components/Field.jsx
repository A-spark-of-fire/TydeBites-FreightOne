/**
 * Label + control + help text used in forms (Procurement, What-if, Optimizer).
 */
export default function Field({ label, help, children }) {
  return (
    <label className="field">
      <b>{label}</b>
      {children}
      <small>{help}</small>
    </label>
  );
}
