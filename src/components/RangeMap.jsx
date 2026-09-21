import { useEffect, useMemo, useState } from 'react';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { FIPS_TO_CODE, STATE_NAMES } from '../lib/states';
import { describeSRank, stateCategory } from '../lib/natureserve';

const ATLAS_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';
const WIDTH = 960;
const HEIGHT = 600;

const CATEGORY_STYLE = {
  native: { fill: '#3d8b4f', label: 'Native' },
  introduced: { fill: '#e8a33d', label: 'Introduced' },
  present: { fill: '#4a90c2', label: 'Recorded (no native/introduced flag)' },
  extirpated: { fill: '#b9b3a8', label: 'Extirpated or historical' },
  absent: { fill: '#f1ece2', label: 'No state record' },
};

let atlasPromise = null;
function loadAtlas() {
  if (!atlasPromise) {
    atlasPromise = fetch(ATLAS_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`us-atlas ${r.status}`);
        return r.json();
      })
      .then((topo) => feature(topo, topo.objects.states).features);
    atlasPromise.catch(() => {
      atlasPromise = null;
    });
  }
  return atlasPromise;
}

/**
 * US choropleth of a species' NatureServe state status, with the searched
 * location marked. `distribution` is the object from fetchDistribution.
 */
export default function RangeMap({ distribution, highlightState, lat, lng }) {
  const [features, setFeatures] = useState(null);
  const [error, setError] = useState('');
  const [hover, setHover] = useState(null);

  useEffect(() => {
    let alive = true;
    loadAtlas()
      .then((f) => alive && setFeatures(f))
      .catch(() => alive && setError('Could not load the base map.'));
    return () => {
      alive = false;
    };
  }, []);

  const { path, projection } = useMemo(() => {
    const projection = geoAlbersUsa().scale(1280).translate([WIDTH / 2, HEIGHT / 2]);
    return { projection, path: geoPath(projection) };
  }, []);

  const marker = useMemo(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return projection([lng, lat]);
  }, [projection, lat, lng]);

  const counts = useMemo(() => {
    const out = {};
    for (const entry of Object.values(distribution?.states || {})) {
      const c = stateCategory(entry);
      out[c] = (out[c] || 0) + 1;
    }
    return out;
  }, [distribution]);

  if (error) return <p className="text-sm text-stone-500">{error}</p>;
  if (!features) return <p className="text-sm italic text-stone-400">Loading map…</p>;

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Map of US states shaded by NatureServe status" className="w-full">
        {features.map((f) => {
          const code = FIPS_TO_CODE[f.id];
          if (!code) return null;
          const entry = distribution?.states?.[code];
          const cat = stateCategory(entry);
          const isHighlight = code === highlightState;
          return (
            <path
              key={f.id}
              d={path(f)}
              fill={CATEGORY_STYLE[cat].fill}
              stroke={isHighlight ? '#1a331a' : '#ffffff'}
              strokeWidth={isHighlight ? 3 : 0.8}
              onMouseEnter={() => setHover({ code, entry, cat })}
              onMouseLeave={() => setHover(null)}
            >
              <title>
                {STATE_NAMES[code] || code}: {CATEGORY_STYLE[cat].label}
                {entry?.srank ? ` · ${describeSRank(entry.srank)}` : ''}
              </title>
            </path>
          );
        })}
        {marker ? (
          <g transform={`translate(${marker[0]},${marker[1]})`}>
            <circle r="14" fill="#dc2626" fillOpacity="0.25" />
            <circle r="6" fill="#dc2626" stroke="#ffffff" strokeWidth="2" />
          </g>
        ) : null}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600">
        {Object.entries(CATEGORY_STYLE).map(([key, s]) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border border-black/10" style={{ background: s.fill }} />
            {s.label}
            {counts[key] ? <span className="text-stone-400">({counts[key]})</span> : null}
          </span>
        ))}
        {marker ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-red-600" /> Your search
          </span>
        ) : null}
      </div>
      <p className="mt-1 min-h-[1.25rem] text-xs text-stone-500">
        {hover
          ? `${STATE_NAMES[hover.code] || hover.code}: ${CATEGORY_STYLE[hover.cat].label}${hover.entry?.srank ? ` · ${describeSRank(hover.entry.srank)}` : ''}`
          : 'Hover a state for its NatureServe rank.'}
      </p>
    </div>
  );
}
