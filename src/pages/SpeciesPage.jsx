import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { track } from '@vercel/analytics';
import { GROUP_BY_KEY, RADIUS_MILES, EXTENDED_RADIUS_MILES, milesToKm } from '../lib/groups';
import { lookupHabitats } from '../lib/worms';
import { classifyHabitat, HABITAT_BY_KEY } from '../lib/habitat';
import { COLORS, formatSize } from '../lib/describe';
import { fetchTaxon, fetchLifeStagePhotos, fetchNearbyCount, LIFE_STAGES } from '../lib/taxon';
import { getCachedDetail, loadDetails } from '../lib/wiki';
import { loadStateGroup, verify, describeSRank, fetchDistribution } from '../lib/natureserve';
import RangeMap from '../components/RangeMap.jsx';
import { fetchGbifEvidence } from '../lib/gbif';
import { STATE_NAMES, toStateCode } from '../lib/states';
import VerificationBadge from '../components/VerificationBadge.jsx';
import { binomial as binomialName } from '../lib/natureserveCore';

const COLOR_BY_KEY = Object.fromEntries(COLORS.map((c) => [c.key, c]));
const STAGE_LABEL = Object.fromEntries(LIFE_STAGES.map((s) => [s.key, s.label]));

export default function SpeciesPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const seed = routerLocation.state?.species;
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  const hasPlace = Number.isFinite(lat) && Number.isFinite(lng) && params.has('lat');
  const placeLabel = params.get('loc') || '';
  const state = toStateCode(params.get('st'));
  const radiusMiles = params.get('r') === String(EXTENDED_RADIUS_MILES) ? EXTENDED_RADIUS_MILES : RADIUS_MILES;
  const radiusKm = milesToKm(radiusMiles);

  const [taxon, setTaxon] = useState(null);
  const [stages, setStages] = useState({});
  const [nearby, setNearby] = useState(seed?.count ?? routerLocation.state?.count ?? null);
  const [detail, setDetail] = useState(() => getCachedDetail(Number(id)) || null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('curated');
  const [lightbox, setLightbox] = useState(null);
  const [check, setCheck] = useState(null); // NatureServe result
  const [gbif, setGbif] = useState(null);
  const [distribution, setDistribution] = useState(undefined); // undefined = loading, null = none
  const [habitat, setHabitat] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setTaxon(null);
    setStages({});
    setError('');
    setTab('curated');
    window.scrollTo(0, 0);
    track('species_view', { id: Number(id) });

    fetchTaxon(id, signal)
      .then((t) => {
        setTaxon(t);
        if (!getCachedDetail(t.id)) {
          loadDetails([t], { onBatch: (map) => setDetail(map.get(t.id) || null) }, signal).catch(() => {});
        }
      })
      .catch((err) => err.name !== 'AbortError' && setError(err.message));
    setCheck(null);
    setGbif(null);
    setDistribution(undefined);
    setHabitat(null);
    fetchLifeStagePhotos(id, signal).then(setStages).catch(() => {});
    const base = seed || null;
    const withTaxon = base ? Promise.resolve(base) : fetchTaxon(id, signal);
    withTaxon
      .then(async (t) => {
        fetchDistribution(t.name)
          .then((d) => !signal.aborted && setDistribution(d))
          .catch(() => !signal.aborted && setDistribution(null));
        lookupHabitats([t.name], {}, signal)
          .then((m) => !signal.aborted && setHabitat(classifyHabitat(t, m.get(binomialName(t.name)) ?? null)))
          .catch(() => {});
        if (state) {
          const index = await loadStateGroup(state, t.group);
          if (!signal.aborted) setCheck(verify(t, index));
        }
        if (hasPlace) {
          const ev = await fetchGbifEvidence(t.name, lat, lng, signal, radiusKm);
          if (!signal.aborted) setGbif(ev);
        }
      })
      .catch(() => {});
    if (hasPlace) fetchNearbyCount(id, lat, lng, signal, radiusKm).then((n) => n != null && setNearby(n)).catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hasPlace, lat, lng, state, radiusKm]);

  const sp = taxon || seed;
  const group = sp ? GROUP_BY_KEY[sp.group] : null;
  const title = sp ? sp.common || sp.name : 'Loading…';

  const tabs = useMemo(() => {
    const out = [];
    if (taxon?.photos?.length) out.push({ key: 'curated', label: 'Featured', n: taxon.photos.length });
    for (const s of LIFE_STAGES) if (stages[s.key]?.length) out.push({ key: s.key, label: s.label, n: stages[s.key].length });
    return out;
  }, [taxon, stages]);

  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.key === tab)) setTab(tabs[0].key);
  }, [tabs, tab]);

  const photos = tab === 'curated' ? taxon?.photos || [] : stages[tab] || [];
  const backHref = params.get('loc') ? `/?q=${encodeURIComponent(placeLabel)}` : '/';

  return (
    <div className="min-h-screen">
      <header className="bg-moss-800 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(backHref))}
            className="rounded-lg border border-moss-300/40 px-3 py-1.5 text-sm hover:bg-moss-700/60"
          >
            ← Back to results
          </button>
          <Link to="/" className="ml-auto flex items-center gap-2 text-sm font-semibold">
            <img src="/favicon.svg" alt="" className="h-6 w-6" /> Nearby Wildlife
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div> : null}

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            {group ? (
              <span className="mb-2 inline-block rounded-full bg-moss-100 px-2.5 py-0.5 text-xs font-medium text-moss-800">
                {group.emoji} {group.label}
              </span>
            ) : null}
            <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight text-stone-900">
              {title}
              {check ? <VerificationBadge status={check.status} state={state} size="md" /> : null}
            </h1>
            {sp?.common ? <p className="text-lg italic text-stone-500">{sp.name}</p> : null}
            {taxon?.ancestors?.length ? (
              <p className="mt-1 text-xs text-stone-500">
                {taxon.ancestors.map((a, i) => (
                  <span key={a.rank}>
                    {i > 0 ? ' › ' : ''}
                    <span className="capitalize text-stone-400">{a.rank}</span> {a.common ? `${a.common} (${a.name})` : a.name}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-stone-200 bg-white p-4 text-sm shadow-sm sm:grid-cols-3">
            {nearby != null ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-stone-500">Within {radiusMiles} mi</dt>
                <dd className="font-semibold text-stone-900">{nearby.toLocaleString()} obs.</dd>
                {placeLabel ? <dd className="line-clamp-1 text-xs text-stone-400" title={placeLabel}>{placeLabel}</dd> : null}
              </div>
            ) : null}
            {taxon ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-stone-500">Worldwide</dt>
                <dd className="font-semibold text-stone-900">{taxon.observationsCount.toLocaleString()} obs.</dd>
              </div>
            ) : null}
            {detail?.sizeCm ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-stone-500">Size (approx.)</dt>
                <dd className="font-semibold text-stone-900">{formatSize(detail.sizeCm)}</dd>
              </div>
            ) : null}
            {habitat ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-stone-500">Habitat ({habitat.source === 'worms' ? 'WoRMS' : 'inferred'})</dt>
                <dd className="font-semibold text-stone-900">
                  {habitat.habitats.map((k) => `${HABITAT_BY_KEY[k].emoji} ${HABITAT_BY_KEY[k].label}`).join(' · ')}
                </dd>
              </div>
            ) : null}
            {taxon?.conservationStatus ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-stone-500">Conservation</dt>
                <dd className="font-semibold capitalize text-stone-900">{taxon.conservationStatus}</dd>
              </div>
            ) : null}
            {detail?.colors?.length ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-stone-500">Colors mentioned</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {detail.colors.map((c) => (
                    <span
                      key={c}
                      title={COLOR_BY_KEY[c].label}
                      className="inline-block h-4 w-4 rounded-full border border-black/15"
                      style={{ background: COLOR_BY_KEY[c].swatch }}
                    />
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <section className="mb-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-stone-900">Verification</h2>
          <p className="mb-3 text-xs text-stone-500">
            iNaturalist sightings are community-submitted. These independent sources show whether the species is actually documented here.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-stone-100 bg-stone-50 p-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                NatureServe state records{state ? ` · ${STATE_NAMES[state] || state}` : ''}
              </div>
              {!state ? (
                <p className="text-sm text-stone-500">No state detected for this search, so the state list could not be checked.</p>
              ) : !check ? (
                <p className="text-sm italic text-stone-400">Checking…</p>
              ) : (
                <>
                  <VerificationBadge status={check.status} state={state} size="md" />
                  <p className="mt-2 text-sm text-stone-700">
                    {check.status === 'native' && `NatureServe lists this species as native to ${STATE_NAMES[state]}.`}
                    {check.status === 'introduced' && `NatureServe lists this species as introduced (non-native) in ${STATE_NAMES[state]}.`}
                    {check.status === 'present' && `NatureServe records this species in ${STATE_NAMES[state]} without a native or introduced flag.`}
                    {check.status === 'undocumented' &&
                      `NatureServe has no record of this species in ${STATE_NAMES[state]}. Nearby sightings are likely escaped pets, vagrants or misidentifications.`}
                    {check.status === 'visitor' &&
                      `NatureServe has no breeding or resident record for this bird in ${STATE_NAMES[state]}. It is most likely a migrant, winter visitor or vagrant rather than an escaped pet.`}
                    {check.status === 'unverified' &&
                      `NatureServe does not list this species in ${STATE_NAMES[state]}. Its coverage of fish and invertebrates is incomplete, so this is not evidence either way.`}
                  </p>
                  {check.record?.srank ? <p className="mt-1 text-xs text-stone-500">{describeSRank(check.record.srank)}</p> : null}
                  {check.record?.url ? (
                    <a href={check.record.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-moss-700 hover:underline">
                      View on NatureServe Explorer ↗
                    </a>
                  ) : null}
                </>
              )}
            </div>
            <div className="rounded-lg border border-stone-100 bg-stone-50 p-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">GBIF records within {radiusMiles} mi</div>
              {!hasPlace ? (
                <p className="text-sm text-stone-500">Open this species from a search to see nearby museum records.</p>
              ) : gbif === null ? (
                <p className="text-sm italic text-stone-400">Checking…</p>
              ) : !gbif ? (
                <p className="text-sm text-stone-500">GBIF has no matching taxon for this name.</p>
              ) : (
                <>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-stone-500">Museum specimens</dt>
                      <dd className="text-lg font-semibold text-stone-900">{gbif.specimens ?? '–'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-stone-500">Surveys &amp; samples</dt>
                      <dd className="text-lg font-semibold text-stone-900">{gbif.institutional ?? '–'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-stone-500">All records</dt>
                      <dd className="text-lg font-semibold text-stone-900">{gbif.total ?? '–'}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-stone-500">
                    {gbif.specimens || gbif.institutional
                      ? 'Physical specimens and institutional surveys confirm this species has been collected or surveyed nearby.'
                      : 'No museum specimens or institutional surveys nearby; all GBIF records here come from observations.'}
                  </p>
                  <a href={gbif.mapUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-moss-700 hover:underline">
                    View records on GBIF ↗
                  </a>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-stone-900">Range by state</h2>
          <p className="mb-3 text-xs text-stone-500">
            Where NatureServe's state natural heritage programs record this species. State-level only: a colored state does not mean the
            species occurs everywhere in it.
          </p>
          {distribution === undefined ? (
            <p className="text-sm italic text-stone-400">Loading NatureServe distribution…</p>
          ) : distribution === null ? (
            <p className="text-sm text-stone-500">NatureServe has no record for this species under this name, so no range map is available.</p>
          ) : (
            <>
              <RangeMap distribution={distribution} highlightState={state} lat={hasPlace ? lat : null} lng={hasPlace ? lng : null} />
              <p className="mt-2 text-xs text-stone-500">
                {Object.keys(distribution.states).length} US states
                {Object.keys(distribution.provinces).length ? ` and ${Object.keys(distribution.provinces).length} Canadian provinces` : ''}
                {distribution.grank ? ` · Global rank ${distribution.grank}` : ''}
                {distribution.url ? (
                  <>
                    {' · '}
                    <a href={distribution.url} target="_blank" rel="noreferrer" className="text-moss-700 hover:underline">
                      Full NatureServe record ↗
                    </a>
                  </>
                ) : null}
              </p>
            </>
          )}
        </section>

        <section className="mb-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-2 text-lg font-semibold text-stone-900">Photos</h2>
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={tab === t.key}
                className={`rounded-full border px-3 py-1 text-sm ${
                  tab === t.key ? 'border-moss-600 bg-moss-600 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-moss-500'
                }`}
              >
                {t.label} <span className={tab === t.key ? 'text-moss-100' : 'text-stone-400'}>{t.n}</span>
              </button>
            ))}
            {!taxon && !error ? <span className="text-sm text-stone-400">Loading photos…</span> : null}
          </div>
          {tab !== 'curated' ? (
            <p className="mb-3 text-xs text-stone-500">
              Community observations annotated as <strong>{STAGE_LABEL[tab]}</strong> on iNaturalist. Click a photo to see it larger; the
              caption links to the observation.
            </p>
          ) : taxon ? (
            <p className="mb-3 text-xs text-stone-500">Photos curated by the iNaturalist community for this species. Click to enlarge.</p>
          ) : null}
          {taxon && !tabs.length ? <p className="text-sm italic text-stone-400">No photos available.</p> : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <figure key={p.id} className="overflow-hidden rounded-lg border border-stone-100 bg-stone-50">
                <button type="button" onClick={() => setLightbox(p)} className="block w-full">
                  <img src={p.medium} alt={`${title}${tab !== 'curated' ? `, ${STAGE_LABEL[tab]}` : ''}`} loading="lazy" className="aspect-square w-full object-cover" />
                </button>
                <figcaption className="truncate px-2 py-1 text-[11px] text-stone-500" title={p.attribution}>
                  {p.observationUrl ? (
                    <a href={p.observationUrl} target="_blank" rel="noreferrer" className="hover:underline">
                      {[p.place, p.date].filter(Boolean).join(' · ') || 'View observation'}
                    </a>
                  ) : (
                    p.attribution
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="mb-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-lg font-semibold text-stone-900">About</h2>
            {detail ? (
              detail.summary ? (
                detail.summary.split(/\n+/).map((para, i) => (
                  <p key={i} className="mb-3 text-sm leading-relaxed text-stone-700">
                    {para}
                  </p>
                ))
              ) : (
                <p className="text-sm italic text-stone-400">No Wikipedia summary available for this species.</p>
              )
            ) : (
              <p className="text-sm italic text-stone-400">Loading description…</p>
            )}
            {detail?.wikiTitle ? (
              <p className="text-xs text-stone-500">
                Text from{' '}
                <a
                  href={`https://en.wikipedia.org/wiki/${encodeURIComponent(detail.wikiTitle.replace(/ /g, '_'))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Wikipedia
                </a>
                , CC BY-SA.
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-lg font-semibold text-stone-900">Links</h2>
            <ul className="space-y-2 text-sm">
              {sp ? (
                <li>
                  <a href={sp.inatUrl || `https://www.inaturalist.org/taxa/${id}`} target="_blank" rel="noreferrer" className="text-moss-700 hover:underline">
                    iNaturalist species page ↗
                  </a>
                </li>
              ) : null}
              {hasPlace ? (
                <li>
                  <a
                    href={`https://www.inaturalist.org/observations?taxon_id=${id}&lat=${lat}&lng=${lng}&radius=16`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-moss-700 hover:underline"
                  >
                    Nearby observations on iNaturalist ↗
                  </a>
                </li>
              ) : null}
              {detail?.wikiTitle ? (
                <li>
                  <a
                    href={`https://en.wikipedia.org/wiki/${encodeURIComponent(detail.wikiTitle.replace(/ /g, '_'))}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-moss-700 hover:underline"
                  >
                    Wikipedia article ↗
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        </section>
      </main>

      {lightbox ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged photo"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4"
        >
          <img src={lightbox.large} alt={title} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
          <p className="mt-3 max-w-2xl text-center text-xs text-stone-300">
            {lightbox.attribution}
            {lightbox.observationUrl ? (
              <>
                {' · '}
                <a href={lightbox.observationUrl} target="_blank" rel="noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>
                  observation
                </a>
              </>
            ) : null}
          </p>
          <button type="button" className="mt-3 rounded-lg border border-stone-500 px-4 py-1.5 text-sm text-white" onClick={() => setLightbox(null)}>
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}
