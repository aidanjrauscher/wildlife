import { Link } from 'react-router-dom';
import { GROUP_BY_KEY } from '../lib/groups';
import { COLORS, formatSize } from '../lib/describe';
import VerificationBadge from './VerificationBadge.jsx';
import { HABITAT_BY_KEY } from '../lib/habitat';
import { EXTENDED_RADIUS_MILES, RADIUS_MILES } from '../lib/groups';

const COLOR_BY_KEY = Object.fromEntries(COLORS.map((c) => [c.key, c]));

export default function SpeciesCard({ species, detail, location, verification, state, habitat }) {
  const group = GROUP_BY_KEY[species.group];
  const title = species.common || species.name;
  const summary = detail?.summary || '';
  const params = new URLSearchParams();
  if (location) {
    params.set('lat', location.lat.toFixed(5));
    params.set('lng', location.lng.toFixed(5));
    params.set('loc', location.label);
  }
  if (state) params.set('st', state);
  if (species.offshore) params.set('r', String(EXTENDED_RADIUS_MILES));
  const href = `/species/${species.id}${params.toString() ? `?${params}` : ''}`;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md">
      <Link
        to={href}
        state={{ species, count: species.count }}
        className="flex flex-1 flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-300"
      >
        <div className="relative aspect-square w-full bg-stone-100">
          {species.photo ? (
            <img
              src={species.photo.medium}
              alt={title}
              loading="lazy"
              title={species.photo.attribution}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-5xl text-stone-300">{group.emoji}</div>
          )}
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-stone-700 shadow-sm">
            {group.emoji} {group.label}
          </span>
          {verification ? <VerificationBadge status={verification.status} state={state} className="absolute right-2 top-2" /> : null}
          {species.offshore ? (
            <span
              title={`Observed within ${EXTENDED_RADIUS_MILES} miles offshore but not within ${RADIUS_MILES} miles`}
              className="absolute bottom-2 left-2 rounded-full bg-sky-700/90 px-2 py-0.5 text-[11px] font-medium text-white shadow-sm"
            >
              🌊 Offshore · {EXTENDED_RADIUS_MILES} mi
            </span>
          ) : null}
        </div>
        <div className="p-3">
          <h3 className="font-semibold leading-tight text-stone-900">{title}</h3>
          {species.common ? <p className="text-sm italic text-stone-500">{species.name}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
            <span title={`Research-grade iNaturalist observations within ${species.radiusMiles || RADIUS_MILES} miles`}>
              {species.count.toLocaleString()} obs.
            </span>
            {habitat ? (
              <span className="flex items-center gap-1" title={`Habitat (${habitat.source === 'worms' ? 'WoRMS' : 'inferred from group'}): ${habitat.habitats.map((k) => HABITAT_BY_KEY[k].label).join(', ')}`}>
                {habitat.habitats.map((k) => (
                  <span key={k} aria-label={HABITAT_BY_KEY[k].label}>{HABITAT_BY_KEY[k].emoji}</span>
                ))}
              </span>
            ) : null}
            {detail?.sizeCm ? <span title="Largest length mentioned in the description">{formatSize(detail.sizeCm)}</span> : null}
            {detail?.colors?.length ? (
              <span className="flex items-center gap-1" title={`Colors mentioned: ${detail.colors.join(', ')}`}>
                {detail.colors.slice(0, 6).map((c) => (
                  <span
                    key={c}
                    className="inline-block h-3 w-3 rounded-full border border-black/15"
                    style={{ background: COLOR_BY_KEY[c].swatch }}
                  />
                ))}
              </span>
            ) : null}
          </div>
          {summary ? (
            <p className="mt-2 line-clamp-3 text-sm text-stone-600">{summary}</p>
          ) : detail ? (
            <p className="mt-2 text-sm italic text-stone-400">No Wikipedia summary available.</p>
          ) : (
            <p className="mt-2 text-sm italic text-stone-400">Loading description…</p>
          )}
        </div>
      </Link>
      <div className="mt-auto flex items-center justify-between border-t border-stone-100 px-3 py-2 text-xs">
        <Link to={href} state={{ species, count: species.count }} className="font-medium text-moss-700 hover:underline">
          Details →
        </Link>
        <a href={species.inatUrl} target="_blank" rel="noreferrer" className="font-medium text-moss-700 hover:underline">
          iNaturalist ↗
        </a>
      </div>
    </article>
  );
}
