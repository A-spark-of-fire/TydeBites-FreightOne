/**
 * Page header used on every module screen.
 * Props: eyebrow, title, desc, action (optional React node)
 */
export default function PageHead({ eyebrow, title, desc, action }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      {action}
    </div>
  );
}
