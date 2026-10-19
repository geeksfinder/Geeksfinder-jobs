/**
 * One admin number (DESIGN.md Admin): large tabular figure with its target in ink-3 beside it. Colour only when off
 * target, warning then danger. With no data it says so and when data will appear; never a placeholder number.
 */
export function Metric({
  label,
  value,
  target,
  tone = "ok",
  empty,
  hint,
}: {
  label: string;
  value: string | number | null;
  target?: string;
  tone?: "ok" | "warning" | "danger";
  /** Shown instead of the number when value is null: when the data will appear */
  empty?: string;
  hint?: string;
}) {
  const colour = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-ink";
  return (
    <div className="bg-paper p-5">
      <dt className="text-small text-ink-2">{label}</dt>
      {value === null ? (
        <dd className="mt-1">
          <span className="text-body font-semibold text-ink">No data yet</span>
          {empty && <span className="mt-0.5 block text-small text-ink-3">{empty}</span>}
        </dd>
      ) : (
        <dd className="mt-1">
          <span className={`tabular text-h2 font-semibold ${colour}`}>{value}</span>
          {target && <span className="ml-2 text-small text-ink-3">target {target}</span>}
          {hint && <span className="mt-0.5 block text-small text-ink-3">{hint}</span>}
        </dd>
      )}
    </div>
  );
}

export function MetricGrid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const c = cols === 4 ? "md:grid-cols-4" : cols === 2 ? "md:grid-cols-2" : "md:grid-cols-3";
  return <dl className={`grid grid-cols-1 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2 ${c}`}>{children}</dl>;
}
