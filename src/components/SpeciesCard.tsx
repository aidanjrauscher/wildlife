import { GROUP_BY_KEY } from '../lib/groups';
import { formatSize, snippet } from '../lib/text';
import type { Species, SpeciesDetail } from '../lib/types';

interface Props {
  species: Species;
  detail: SpeciesDetail | undefined;
  patterns: RegExp[];
  onSelect: (s: Species) => void;
}

export function EstablishmentBadge({ value }: { value: Species['establishment'] }) {
  if (value === 'native') return <span className="badge badge--native" title="Recorded as native to this area">Native</span>;
  if (value === 'introduced')
    return <span className="badge badge--introduced" title="Recorded as introduced (non-native) in this area">Introduced</span>;
  return null;
}

export function SpeciesCard({ species, detail, patterns, onSelect }: Props) {
  const g = GROUP_BY_KEY[species.group];
  const title = species.common ?? species.name;
  const text = detail?.summary ? snippet(detail.summary, patterns) : '';

  return (
    <article className="card" onClick={() => onSelect(species)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect(species)}>
      <div className="card__media">
        {species.photo ? (
          <img src={species.photo.medium} alt={title} loading="lazy" decoding="async" />
        ) : (
          <div className="card__nophoto" aria-hidden="true">
            {g.emoji}
          </div>
        )}
        <span className="card__group" title={g.label}>
          {g.emoji} {g.short}
        </span>
      </div>
      <div className="card__body">
        <h3 className="card__title">{title}</h3>
        {species.common && <p className="card__sci">{species.name}</p>}
        <div className="card__meta">
          <EstablishmentBadge value={species.establishment} />
          {detail?.sizeCm != null && <span className="badge">{formatSize(detail.sizeCm)}</span>}
          <span className="card__count" title="Research-grade iNaturalist observations within 10 miles">
            {species.count.toLocaleString()} obs
          </span>
        </div>
        {text && <p className="card__snippet">{text}</p>}
      </div>
    </article>
  );
}
