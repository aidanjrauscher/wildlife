import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DetailModal } from './components/DetailModal';
import { DEFAULT_FILTERS, FilterBar, type Filters } from './components/FilterBar';
import { SearchForm } from './components/SearchForm';
import { SpeciesCard } from './components/SpeciesCard';
import { fetchGroup, geocode } from './lib/api';
import { enricher } from './lib/enrich';
import { GROUPS, RADIUS_MILES } from './lib/groups';
import { compileTokens, hasColor, matchesAll, sizeBucket, tokenize } from './lib/text';
import type { GeocodeResult, GroupKey, Species } from './lib/types';

type GroupStatus = Record<GroupKey, 'loading' | 'done' | 'error'>;
type Phase = 'idle' | 'geocoding' | 'loading' | 'done' | 'error';

const PAGE = 48;
/** Load this many groups at a time so we stay well within iNaturalist's rate limits. */
const GROUP_CONCURRENCY = 2;

function initialGroupStatus(): GroupStatus {
  return Object.fromEntries(GROUPS.map((g) => [g.key, 'loading'])) as GroupStatus;
}

function readQueryFromUrl(): string {
  return new URLSearchParams(window.location.search).get('q') ?? '';
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<GeocodeResult | null>(null);
  const [species, setSpecies] = useState<Species[]>([]);
  const [groupStatus, setGroupStatus] = useState<GroupStatus>(initialGroupStatus);
  const [truncated, setTruncated] = useState<GroupKey[]>([]);
  const [filters, setFilters] = useState<Filters>(() => ({ ...DEFAULT_FILTERS, groups: new Set(DEFAULT_FILTERS.groups) }));
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Species | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const abortRef = useRef<AbortController | null>(null);
  const initialQuery = useRef(readQueryFromUrl());

  // Re-render (throttled) as descriptions arrive in the background.
  useEffect(() => enricher.subscribe(bump), []);

  // Ask for descriptions of everything we have, most-observed first.
  useEffect(() => {
    if (species.length === 0) return;
    enricher.request([...species].sort((a, b) => b.count - a.count).map((s) => s.id));
  }, [species]);

  const runSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase('geocoding');
    setError(null);
    setSpecies([]);
    setTruncated([]);
    setLocation(null);
    setLimit(PAGE);
    setGroupStatus(initialGroupStatus());
    enricher.reset();

    const url = new URL(window.location.href);
    url.searchParams.set('q', q);
    window.history.replaceState(null, '', url);

    let loc: GeocodeResult;
    try {
      loc = await geocode(q, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError((err as Error).message);
      setPhase('error');
      return;
    }
    if (controller.signal.aborted) return;
    setLocation(loc);
    setPhase('loading');

    const queue = [...GROUPS];
    const worker = async () => {
      while (queue.length) {
        const g = queue.shift()!;
        try {
          const resp = await fetchGroup(g.key, loc.lat, loc.lng, controller.signal);
          if (controller.signal.aborted) return;
          setSpecies((prev) => [...prev, ...resp.species]);
          if (resp.truncated) setTruncated((prev) => [...prev, g.key]);
          setGroupStatus((prev) => ({ ...prev, [g.key]: 'done' }));
        } catch {
          if (controller.signal.aborted) return;
          setGroupStatus((prev) => ({ ...prev, [g.key]: 'error' }));
        }
      }
    };
    await Promise.all(Array.from({ length: GROUP_CONCURRENCY }, worker));
    if (!controller.signal.aborted) setPhase('done');
  }, []);

  useEffect(() => {
    if (initialQuery.current) void runSearch(initialQuery.current);
  }, [runSearch]);

  const patterns = useMemo(() => compileTokens(tokenize(filters.text)), [filters.text]);

  // Everything except the group filter, so the group chips can show live counts.
  const baseFiltered = useMemo(() => {
    const colors = [...filters.colors];
    return species.filter((s) => {
      if (filters.hideIntroduced && s.establishment === 'introduced') return false;
      if (patterns.length === 0 && colors.length === 0 && !filters.size) return true;
      const d = enricher.get(s.id);
      const hay = `${s.common ?? ''} ${s.name} ${d?.summary ?? ''}`;
      if (patterns.length && !matchesAll(hay, patterns)) return false;
      for (const c of colors) if (!hasColor(hay, c)) return false;
      if (filters.size && sizeBucket(d?.sizeCm ?? null) !== filters.size) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species, filters.hideIntroduced, filters.size, filters.colors, patterns, enricher.progress.done]);

  const groupCounts = useMemo(() => {
    const counts = Object.fromEntries(GROUPS.map((g) => [g.key, 0])) as Record<GroupKey, number>;
    for (const s of baseFiltered) counts[s.group]++;
    return counts;
  }, [baseFiltered]);

  const results = useMemo(() => {
    const list = baseFiltered.filter((s) => filters.groups.has(s.group));
    if (filters.sort === 'name') list.sort((a, b) => (a.common ?? a.name).localeCompare(b.common ?? b.name));
    else list.sort((a, b) => b.count - a.count);
    return list;
  }, [baseFiltered, filters.groups, filters.sort]);

  useEffect(() => setLimit(PAGE), [filters]);

  const progress = enricher.progress;
  const enriching = progress.total > 0 && progress.done < progress.total;
  const busy = phase === 'geocoding' || phase === 'loading';
  const usesDescriptions = patterns.length > 0 || filters.colors.size > 0 || !!filters.size;
  const failedGroups = GROUPS.filter((g) => groupStatus[g.key] === 'error');

  return (
    <div className="app">
      <header className="hero">
        <h1>Nearby Wildlife</h1>
        <p className="hero__tag">
          Every mammal, bird, reptile, amphibian, fish and invertebrate recorded within {RADIUS_MILES} miles of a US address.
        </p>
        <SearchForm initial={initialQuery.current} busy={busy} onSearch={(q) => void runSearch(q)} />
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
      </header>

      {location && (
        <main className="results">
          <div className="status">
            <p className="status__where">
              <strong>{species.length.toLocaleString()}</strong> species within {RADIUS_MILES} miles of{' '}
              <span className="status__label">{location.label}</span>
              {phase === 'loading' && <span className="spinner" aria-label="Loading" />}
            </p>
            {enriching && (
              <div className="progress" title="Loading Wikipedia descriptions used for color, size and text matching">
                <div className="progress__bar" style={{ width: `${(100 * progress.done) / progress.total}%` }} />
                <span className="progress__text">
                  Loading descriptions {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          <FilterBar filters={filters} groupCounts={groupCounts} groupStatus={groupStatus} onChange={setFilters} />

          {failedGroups.length > 0 && (
            <p className="alert alert--warn">
              Could not load {failedGroups.map((g) => g.label.toLowerCase()).join(', ')}.{' '}
              <button type="button" className="linklike" onClick={() => location && void runSearch(readQueryFromUrl())}>
                Retry
              </button>
            </p>
          )}
          {truncated.length > 0 && (
            <p className="alert alert--info">
              Showing the 2,000 most-observed {truncated.map((k) => GROUPS.find((g) => g.key === k)!.label.toLowerCase()).join(', ')}.
            </p>
          )}
          {usesDescriptions && enriching && (
            <p className="alert alert--info">
              Descriptive, color and size matching improves as descriptions finish loading. Results will update automatically.
            </p>
          )}
          {filters.size && (
            <p className="alert alert--info">
              Size is estimated from Wikipedia text and only available for some species. Use “Reset filters” to see all.
            </p>
          )}

          <p className="results__count" aria-live="polite">
            {results.length.toLocaleString()} {results.length === 1 ? 'match' : 'matches'}
          </p>

          {results.length === 0 && phase === 'done' && (
            <p className="empty">
              {species.length === 0
                ? 'No research-grade observations found nearby. Try a different address or a nearby town.'
                : 'Nothing matches those filters. Try fewer words or a different color.'}
            </p>
          )}

          <div className="grid">
            {results.slice(0, limit).map((s) => (
              <SpeciesCard key={s.id} species={s} detail={enricher.get(s.id)} patterns={patterns} onSelect={setSelected} />
            ))}
          </div>
          {results.length > limit && (
            <div className="more">
              <button type="button" className="btn" onClick={() => setLimit((l) => l + PAGE * 2)}>
                Show more ({(results.length - limit).toLocaleString()} remaining)
              </button>
            </div>
          )}
        </main>
      )}

      <footer className="foot">
        <p>
          Species data: research-grade observations from{' '}
          <a href="https://www.inaturalist.org" target="_blank" rel="noopener noreferrer">
            iNaturalist
          </a>
          , tagged native/introduced by iNaturalist’s place checklists. Descriptions from Wikipedia. Geocoding by the US Census Bureau and{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            OpenStreetMap
          </a>{' '}
          contributors. Photos © their photographers (see each species).
        </p>
      </footer>

      <DetailModal species={selected} detail={selected ? enricher.get(selected.id) : undefined} onClose={() => setSelected(null)} />
    </div>
  );
}
