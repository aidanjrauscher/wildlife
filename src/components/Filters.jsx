import { GROUPS } from '../lib/groups';
import { COLORS, SIZES } from '../lib/describe';
import { STATUS_META } from '../lib/natureserve';
import { STATE_NAMES } from '../lib/states';

const STATUS_ORDER = ['native', 'introduced', 'present', 'undocumented', 'visitor', 'unverified'];

function Chip({ active, onClick, children, title }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? 'border-moss-600 bg-moss-600 text-white shadow-sm'
          : 'border-stone-300 bg-white text-stone-700 hover:border-moss-500 hover:text-moss-700'
      }`}
    >
      {children}
    </button>
  );
}

export default function Filters({ filters, setFilters, groupCounts, detailProgress, verification, statusCounts }) {
  const toggleSet = (key, value) =>
    setFilters((f) => {
      const next = new Set(f[key]);
      next.has(value) ? next.delete(value) : next.add(value);
      return { ...f, [key]: next };
    });

  const detailsLoading = detailProgress.total > 0 && detailProgress.done < detailProgress.total;
  const anyActive = filters.groups.size || filters.colors.size || filters.size || filters.text || filters.verification.size || !filters.hideUndocumented;
  const stateName = verification.state ? STATE_NAMES[verification.state] || verification.state : null;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Type of animal</div>
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => {
            const n = groupCounts[g.key];
            return (
              <Chip key={g.key} active={filters.groups.has(g.key)} onClick={() => toggleSet('groups', g.key)}>
                <span aria-hidden="true">{g.emoji}</span>
                {g.label}
                <span className={`text-xs ${filters.groups.has(g.key) ? 'text-moss-100' : 'text-stone-400'}`}>
                  {n == null ? '…' : n}
                </span>
              </Chip>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          <span>Cross-reference</span>
          <span className="font-normal normal-case tracking-normal text-stone-400">
            {verification.status === 'unavailable'
              ? 'could not determine the state for this location'
              : stateName
                ? `NatureServe state records for ${stateName}${verification.status === 'loading' ? ' (loading…)' : ''}`
                : 'detecting state…'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_ORDER.map((key) => {
            const meta = STATUS_META[key];
            const n = statusCounts[key] || 0;
            if (!n && !filters.verification.has(key)) return null;
            return (
              <Chip
                key={key}
                active={filters.verification.has(key)}
                title={meta.label}
                onClick={() =>
                  setFilters((f) => {
                    const next = new Set(f.verification);
                    next.has(key) ? next.delete(key) : next.add(key);
                    // Selecting "not documented" explicitly should reveal those species.
                    const hideUndocumented = key === 'undocumented' && next.has(key) ? false : f.hideUndocumented;
                    return { ...f, verification: next, hideUndocumented };
                  })
                }
              >
                <span aria-hidden="true">{meta.icon}</span>
                {meta.label}
                <span className={`text-xs ${filters.verification.has(key) ? 'text-moss-100' : 'text-stone-400'}`}>{n}</span>
              </Chip>
            );
          })}
          {verification.status === 'ready' || verification.status === 'loading' ? (
            <label className="ml-1 flex cursor-pointer items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={filters.hideUndocumented}
                onChange={(e) => setFilters((f) => ({ ...f, hideUndocumented: e.target.checked }))}
                className="h-4 w-4 accent-moss-600"
              />
              Hide species not documented in {verification.state}
            </label>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-stone-500">
          Mammals, reptiles and amphibians missing from the state list are usually escaped pets, vagrants or misidentified sightings and
          are hidden by default. Birds missing from the list are usually migrants, winter visitors or vagrants, since NatureServe tracks
          breeding and resident birds. Fish and invertebrate coverage is incomplete, so those are only marked when NatureServe lists them.
        </p>
        {verification.errors?.length ? (
          <p className="mt-1 text-xs text-amber-700">Some NatureServe lists failed to load: {verification.errors.join('; ')}</p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="text" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-500">
            Describe it
          </label>
          <input
            id="text"
            type="search"
            value={filters.text}
            onChange={(e) => setFilters((f) => ({ ...f, text: e.target.value }))}
            placeholder='e.g. "nocturnal", "red crest", "venomous", "shell", "turtle"'
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-moss-300"
          />
          <p className="mt-1 text-xs text-stone-500">Matches names and Wikipedia descriptions. Every word must match.</p>
        </div>
        <div>
          <label htmlFor="sort" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-500">
            Sort
          </label>
          <select
            id="sort"
            value={filters.sort}
            onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-moss-300"
          >
            <option value="count">Most observed</option>
            <option value="name">Common name A–Z</option>
            <option value="size">Largest first</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Color</div>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <Chip key={c.key} active={filters.colors.has(c.key)} onClick={() => toggleSet('colors', c.key)} title={c.label}>
                <span
                  aria-hidden="true"
                  className="inline-block h-3.5 w-3.5 rounded-full border border-black/15"
                  style={{ background: c.swatch }}
                />
                {c.label}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Approximate size</div>
          <div className="flex flex-wrap gap-2">
            {SIZES.map((s) => (
              <Chip
                key={s.key}
                active={filters.size === s.key}
                onClick={() => setFilters((f) => ({ ...f, size: f.size === s.key ? '' : s.key }))}
                title={s.hint}
              >
                {s.label}
                <span className={`text-xs ${filters.size === s.key ? 'text-moss-100' : 'text-stone-400'}`}>{s.hint}</span>
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
        <span>
          {detailsLoading
            ? `Loading descriptions for color, size and text matching… ${detailProgress.done}/${detailProgress.total}`
            : detailProgress.total > 0
              ? 'Descriptions loaded. Color and size are estimated from Wikipedia text, so treat them as approximate.'
              : ''}
        </span>
        {anyActive ? (
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, groups: new Set(), colors: new Set(), size: '', text: '', verification: new Set(), hideUndocumented: true }))}
            className="font-medium text-moss-700 hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
