import { GROUPS } from '../lib/groups';
import { COLORS, SIZES, type SizeKey } from '../lib/text';
import type { GroupKey } from '../lib/types';

export type SortKey = 'count' | 'name';

export interface Filters {
  groups: Set<GroupKey>;
  hideIntroduced: boolean;
  text: string;
  colors: Set<string>;
  size: SizeKey | null;
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  groups: new Set(GROUPS.map((g) => g.key)),
  hideIntroduced: true,
  text: '',
  colors: new Set(),
  size: null,
  sort: 'count',
};

interface Props {
  filters: Filters;
  groupCounts: Record<GroupKey, number>;
  groupStatus: Record<GroupKey, 'loading' | 'done' | 'error'>;
  onChange: (next: Filters) => void;
}

export function FilterBar({ filters, groupCounts, groupStatus, onChange }: Props) {
  const allGroups = filters.groups.size === GROUPS.length;

  function toggleGroup(key: GroupKey) {
    const next = new Set(filters.groups);
    if (allGroups) {
      // First click narrows to just that group; feels more natural than deselecting one of six.
      next.clear();
      next.add(key);
    } else if (next.has(key)) {
      next.delete(key);
      if (next.size === 0) GROUPS.forEach((g) => next.add(g.key));
    } else {
      next.add(key);
    }
    onChange({ ...filters, groups: next });
  }

  function toggleColor(key: string) {
    const next = new Set(filters.colors);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange({ ...filters, colors: next });
  }

  const dirty =
    !allGroups || !filters.hideIntroduced || filters.text || filters.colors.size > 0 || filters.size || filters.sort !== 'count';

  return (
    <section className="filters" aria-label="Filters">
      <div className="filters__row">
        <div className="chips" role="group" aria-label="Animal type">
          <button
            type="button"
            className={`chip ${allGroups ? 'chip--on' : ''}`}
            onClick={() => onChange({ ...filters, groups: new Set(GROUPS.map((g) => g.key)) })}
          >
            All types
          </button>
          {GROUPS.map((g) => {
            const on = !allGroups && filters.groups.has(g.key);
            const st = groupStatus[g.key];
            return (
              <button
                key={g.key}
                type="button"
                className={`chip ${on ? 'chip--on' : ''} ${st === 'error' ? 'chip--error' : ''}`}
                onClick={() => toggleGroup(g.key)}
                title={st === 'error' ? `Failed to load ${g.label}` : g.label}
              >
                <span aria-hidden="true">{g.emoji}</span> {g.short}
                <span className="chip__count">{st === 'loading' ? '…' : st === 'error' ? '!' : groupCounts[g.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="filters__row">
        <input
          className="filters__text"
          type="search"
          placeholder="Describe it: “small red bird”, “striped”, “nocturnal”, “venomous”…"
          value={filters.text}
          onChange={(e) => onChange({ ...filters, text: e.target.value })}
          aria-label="Descriptive text search"
        />
        <label className="check">
          <input
            type="checkbox"
            checked={filters.hideIntroduced}
            onChange={(e) => onChange({ ...filters, hideIntroduced: e.target.checked })}
          />
          Hide introduced species
        </label>
        <label className="select">
          Sort
          <select value={filters.sort} onChange={(e) => onChange({ ...filters, sort: e.target.value as SortKey })}>
            <option value="count">Most observed</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
      </div>

      <div className="filters__row filters__row--wrap">
        <div className="chips chips--colors" role="group" aria-label="Color">
          <span className="chips__label">Color</span>
          {COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`chip chip--color ${filters.colors.has(c.key) ? 'chip--on' : ''}`}
              onClick={() => toggleColor(c.key)}
              aria-pressed={filters.colors.has(c.key)}
            >
              <span className="swatch" style={{ background: c.css }} aria-hidden="true" />
              {c.label}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Size">
          <span className="chips__label">Size</span>
          {SIZES.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`chip ${filters.size === s.key ? 'chip--on' : ''}`}
              title={s.hint}
              onClick={() => onChange({ ...filters, size: filters.size === s.key ? null : s.key })}
              aria-pressed={filters.size === s.key}
            >
              {s.label}
            </button>
          ))}
        </div>
        {dirty && (
          <button type="button" className="btn btn--ghost" onClick={() => onChange({ ...DEFAULT_FILTERS, groups: new Set(DEFAULT_FILTERS.groups) })}>
            Reset filters
          </button>
        )}
      </div>
    </section>
  );
}
