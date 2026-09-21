import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { track } from '@vercel/analytics';
import SearchForm from './components/SearchForm.jsx';
import Filters from './components/Filters.jsx';
import SpeciesCard from './components/SpeciesCard.jsx';
import SpeciesPage from './pages/SpeciesPage.jsx';
import { geocodeAddress } from './lib/geocode';
import { fetchAllSpecies } from './lib/inat';
import { loadDetails, getCachedDetail } from './lib/wiki';
import { GROUPS, RADIUS_MILES } from './lib/groups';
import { loadState, verify } from './lib/natureserve';
import { stateForCoords, toStateCode, STATE_NAMES } from './lib/states';

const PAGE = 60;

const EMPTY_FILTERS = { groups: new Set(), colors: new Set(), size: '', text: '', sort: 'count', verification: new Set(), hideUndocumented: true };
const EMPTY_VERIFICATION = { state: null, status: 'idle', indexes: {}, errors: [] };

export default function App() {
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState(() => new URLSearchParams(routerLocation.search).get('q') || '');
  const [location, setLocation] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | geocoding | loading | ready | error
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [nativeOnly, setNativeOnly] = useState(true);
  const [groupsData, setGroupsData] = useState({});
  const [details, setDetails] = useState({});
  const [detailProgress, setDetailProgress] = useState({ done: 0, total: 0 });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [limit, setLimit] = useState(PAGE);
  const [verification, setVerification] = useState(EMPTY_VERIFICATION);
  const abortRef = useRef(null);

  const abortInFlight = () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    return abortRef.current.signal;
  };

  const loadSpecies = useCallback(async (loc, native, signal) => {
    setStatus('loading');
    setGroupsData({});
    setDetails({});
    setDetailProgress({ done: 0, total: 0 });
    setWarnings([]);
    setLimit(PAGE);

    const collected = [];
    const { failures } = await fetchAllSpecies(
      { lat: loc.lat, lng: loc.lng, nativeOnly: native },
      (res) => {
        collected.push(...res.species);
        setGroupsData((d) => ({ ...d, [res.group]: res }));
      },
      signal,
    );
    if (signal.aborted) return;
    if (failures.length) setWarnings(failures.map((e) => e.message));
    setStatus('ready');

    const seeded = {};
    for (const sp of collected) {
      const cached = getCachedDetail(sp.id);
      if (cached) seeded[sp.id] = cached;
    }
    setDetails(seeded);
    await loadDetails(
      collected,
      {
        onBatch: (map) => setDetails((d) => ({ ...d, ...Object.fromEntries(map) })),
        onProgress: (done, total) => setDetailProgress({ done, total }),
      },
      signal,
    );
  }, []);

  /**
   * Run a search. `input` is either a free-text address (geocoded server-side)
   * or an autocomplete suggestion { label, lat, lng, source } that already has
   * coordinates.
   */
  const search = useCallback(
    async (input) => {
      const signal = abortInFlight();
      const label = typeof input === 'string' ? input : input.label;
      setQuery(label);
      setError('');
      setStatus('geocoding');
      setLocation(null);
      setGroupsData({});
      navigate(`/?q=${encodeURIComponent(label)}`, { replace: routerLocation.pathname === '/' });
      try {
        const loc = typeof input === 'string' ? await geocodeAddress(input, signal) : input;
        if (signal.aborted) return;
        setLocation(loc);
        track('search', { source: loc.source, nativeOnly });
        await loadSpecies(loc, nativeOnly, signal);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Something went wrong.');
        setStatus('error');
      }
    },
    [loadSpecies, nativeOnly, navigate, routerLocation.pathname],
  );

  // Re-run the species query (not geocoding) when the native toggle changes.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!location) return;
    const signal = abortInFlight();
    track('toggle_native', { nativeOnly });
    loadSpecies(location, nativeOnly, signal).catch((err) => {
      if (err.name !== 'AbortError') {
        setError(err.message);
        setStatus('error');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeOnly]);

  // Auto-search once when the app loads with ?q= on the search page (guarded against StrictMode's double mount).
  const autoSearched = useRef(false);
  useEffect(() => {
    if (autoSearched.current) return;
    autoSearched.current = true;
    if (query && routerLocation.pathname === '/') search(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-reference: load NatureServe state lists whenever the searched location changes.
  useEffect(() => {
    if (!location) {
      setVerification(EMPTY_VERIFICATION);
      return undefined;
    }
    const controller = new AbortController();
    const { signal } = controller;
    (async () => {
      let st = toStateCode(location.state);
      if (!st) {
        try {
          st = await stateForCoords(location.lat, location.lng, signal);
        } catch {
          st = null;
        }
      }
      if (signal.aborted) return;
      if (!st) {
        setVerification({ ...EMPTY_VERIFICATION, status: 'unavailable' });
        return;
      }
      setVerification({ state: st, status: 'loading', indexes: {}, errors: [] });
      const errors = await loadState(
        st,
        (group, index) => setVerification((v) => ({ ...v, indexes: { ...v.indexes, [group]: index } })),
        signal,
      );
      if (!signal.aborted) setVerification((v) => ({ ...v, status: 'ready', errors: errors.map((e) => e.message) }));
    })();
    return () => controller.abort();
  }, [location]);

  const allSpecies = useMemo(() => GROUPS.flatMap((g) => groupsData[g.key]?.species ?? []), [groupsData]);

  const groupCounts = useMemo(() => {
    const out = {};
    for (const g of GROUPS) if (groupsData[g.key]) out[g.key] = groupsData[g.key].species.length;
    return out;
  }, [groupsData]);

  const statuses = useMemo(() => {
    const out = {};
    for (const sp of allSpecies) {
      const v = verify(sp, verification.indexes[sp.group]);
      if (v) out[sp.id] = v;
    }
    return out;
  }, [allSpecies, verification.indexes]);

  const statusCounts = useMemo(() => {
    const out = {};
    for (const v of Object.values(statuses)) out[v.status] = (out[v.status] || 0) + 1;
    return out;
  }, [statuses]);

  const filtered = useMemo(() => {
    const tokens = filters.text.toLowerCase().split(/\s+/).filter(Boolean);
    const list = allSpecies.filter((sp) => {
      if (filters.groups.size && !filters.groups.has(sp.group)) return false;
      const v = statuses[sp.id];
      if (filters.hideUndocumented && v?.status === 'undocumented') return false;
      if (filters.verification.size && (!v || !filters.verification.has(v.status))) return false;
      const d = details[sp.id];
      if (filters.colors.size) {
        if (!d) return false;
        for (const c of filters.colors) if (!d.colors.includes(c)) return false;
      }
      if (filters.size && d?.size !== filters.size) return false;
      if (tokens.length) {
        const hay = `${sp.common || ''} ${sp.name} ${d?.summary || ''}`.toLowerCase();
        for (const t of tokens) if (!hay.includes(t)) return false;
      }
      return true;
    });
    if (filters.sort === 'name') {
      list.sort((a, b) => (a.common || a.name).localeCompare(b.common || b.name));
    } else if (filters.sort === 'size') {
      list.sort((a, b) => (details[b.id]?.sizeCm ?? -1) - (details[a.id]?.sizeCm ?? -1) || b.count - a.count);
    } else {
      list.sort((a, b) => b.count - a.count);
    }
    return list;
  }, [allSpecies, details, filters, statuses]);

  useEffect(() => setLimit(PAGE), [filters]);

  const searchPage = (
    <SearchPage
      {...{ query, location, status, error, warnings, nativeOnly, setNativeOnly, groupsData, details, detailProgress, filters, setFilters, limit, setLimit, allSpecies, groupCounts, filtered, search, verification, statuses, statusCounts }}
    />
  );

  return (
    <Routes>
      <Route path="/" element={searchPage} />
      <Route path="/species/:id" element={<SpeciesPage />} />
      <Route path="*" element={searchPage} />
    </Routes>
  );
}

function SearchPage({
  query, location, status, error, warnings, nativeOnly, setNativeOnly, groupsData, details, detailProgress,
  filters, setFilters, limit, setLimit, allSpecies, groupCounts, filtered, search, verification, statuses, statusCounts,
}) {
  const hiddenUndocumented = filters.hideUndocumented ? statusCounts.undocumented || 0 : 0;
  const busy = status === 'geocoding' || status === 'loading';
  const groupsDone = GROUPS.filter((g) => groupsData[g.key]).length;
  const needsDetails = filters.colors.size || filters.size;
  const detailsLoading = detailProgress.total > 0 && detailProgress.done < detailProgress.total;

  return (
    <div className="min-h-screen">
      <header className="bg-moss-800 text-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
          <div className="mb-6 flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="h-10 w-10" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Nearby Wildlife</h1>
              <p className="text-sm text-moss-100/90">
                Mammals, birds, reptiles, amphibians, fish and invertebrates found within {RADIUS_MILES} miles of any US address.
              </p>
            </div>
          </div>
          <SearchForm initialValue={query} busy={busy} onSearch={search} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {status === 'idle' ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500">
            <p className="text-lg">Enter an address above to see the wild animals that live around it.</p>
            <p className="mt-2 text-sm">
              Species come from research-grade community observations on iNaturalist, so results reflect what people have actually
              seen and identified nearby.
            </p>
          </div>
        ) : null}

        {status === 'geocoding' ? (
          <div className="mb-4 rounded-xl border border-stone-200 bg-white p-4 text-stone-600">Locating “{query}”…</div>
        ) : null}
        {status === 'error' ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div> : null}

        {location ? (
          <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Searching around</div>
                <div className="font-medium text-stone-900">{location.label}</div>
                <div className="text-xs text-stone-500">
                  {location.lat.toFixed(4)}, {location.lng.toFixed(4)} · {RADIUS_MILES}-mile radius ·{' '}
                  {{ census: 'US Census geocoder', nominatim: 'OpenStreetMap Nominatim', photon: 'OpenStreetMap via Photon' }[location.source] || location.source}
                  {verification.state ? ` · State: ${STATE_NAMES[verification.state] || verification.state}` : ''}
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={nativeOnly}
                  onChange={(e) => setNativeOnly(e.target.checked)}
                  className="h-4 w-4 accent-moss-600"
                />
                Native species only
                <span className="text-xs text-stone-400">(uncheck to include introduced species)</span>
              </label>
            </div>
            {status === 'loading' ? (
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                  <div className="h-full bg-moss-500 transition-all" style={{ width: `${Math.max(8, (groupsDone / GROUPS.length) * 100)}%` }} />
                </div>
                <div className="mt-1 text-xs text-stone-500">
                  Loading species from iNaturalist… {groupsDone}/{GROUPS.length} groups
                </div>
              </div>
            ) : null}
            {warnings.length ? (
              <ul className="mt-3 space-y-1 text-sm text-amber-800">
                {warnings.map((w) => (
                  <li key={w} className="rounded-lg bg-amber-50 px-3 py-2">
                    ⚠ {w}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {location && (status === 'ready' || status === 'loading') ? (
          <>
            <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <Filters filters={filters} setFilters={setFilters} groupCounts={groupCounts} detailProgress={detailProgress} verification={verification} statusCounts={statusCounts} />
            </section>

            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-stone-900">
                {filtered.length.toLocaleString()} of {allSpecies.length.toLocaleString()} species
              </h2>
              <span className="text-xs text-stone-500">
                {hiddenUndocumented ? `${hiddenUndocumented} not documented in ${verification.state} hidden. ` : ''}
                {needsDetails && detailsLoading ? 'Color and size filters fill in as descriptions load.' : ''}
              </span>
            </div>

            {filtered.length === 0 && status === 'ready' ? (
              <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500">
                {allSpecies.length === 0
                  ? 'No research-grade observations found within 10 miles. Try a different address or include introduced species.'
                  : 'No species match those filters.'}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.slice(0, limit).map((sp) => (
                <SpeciesCard key={sp.id} species={sp} detail={details[sp.id]} location={location} verification={statuses[sp.id]} state={verification.state} />
              ))}
            </div>

            {filtered.length > limit ? (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setLimit((l) => l + PAGE)}
                  className="rounded-lg border border-moss-600 bg-white px-5 py-2.5 font-medium text-moss-700 hover:bg-moss-50"
                >
                  Show {Math.min(PAGE, filtered.length - limit)} more
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-stone-500">
        <p>
          Species data and photos from{' '}
          <a href="https://www.inaturalist.org" className="underline" target="_blank" rel="noreferrer">
            iNaturalist
          </a>{' '}
          (research-grade observations; photos are credited to their observers). Descriptions from{' '}
          <a href="https://en.wikipedia.org" className="underline" target="_blank" rel="noreferrer">
            Wikipedia
          </a>{' '}
          (CC BY-SA). Cross-reference from{' '}
          <a href="https://explorer.natureserve.org" className="underline" target="_blank" rel="noreferrer">
            NatureServe Explorer
          </a>{' '}
          state records. Geocoding by the US Census Bureau, OpenStreetMap contributors and Photon. Color and size attributes are
          estimated from description text and may be imprecise.
        </p>
      </footer>
    </div>
  );
}
