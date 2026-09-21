import { STATUS_META } from '../lib/natureserve';

/** Small pill showing the NatureServe cross-reference status for a species. */
export default function VerificationBadge({ status, state, size = 'sm', className = '' }) {
  if (!status) return null;
  const meta = STATUS_META[status];
  const text = size === 'sm' ? meta.short : `${meta.label}${state ? ` in ${state}` : ''}`;
  return (
    <span
      title={`${meta.label}${state ? ` in ${state}` : ''} (NatureServe)`}
      className={`inline-flex items-center gap-1 rounded-full font-medium shadow-sm ${meta.color} ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-sm'
      } ${className}`}
    >
      <span aria-hidden="true">{meta.icon}</span>
      {text}
    </span>
  );
}
