import { useEffect, useRef } from 'react';
import { GROUP_BY_KEY } from '../lib/groups';
import { formatSize } from '../lib/text';
import type { Species, SpeciesDetail } from '../lib/types';
import { EstablishmentBadge } from './SpeciesCard';

interface Props {
  species: Species | null;
  detail: SpeciesDetail | undefined;
  onClose: () => void;
}

export function DetailModal({ species, detail, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (species && !el.open) el.showModal();
    if (!species && el.open) el.close();
  }, [species]);

  if (!species) return <dialog ref={ref} className="modal" onClose={onClose} />;
  const g = GROUP_BY_KEY[species.group];
  const title = species.common ?? species.name;

  return (
    <dialog
      ref={ref}
      className="modal"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal__inner">
        <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {species.photo && (
          <figure className="modal__figure">
            <img src={species.photo.medium} alt={title} />
            {species.photo.attribution && <figcaption>{species.photo.attribution}</figcaption>}
          </figure>
        )}
        <div className="modal__body">
          <p className="modal__group">
            {g.emoji} {g.label}
            {species.iconic && species.iconic !== 'Animalia' && species.iconic !== g.label ? ` · ${species.iconic}` : ''}
          </p>
          <h2 className="modal__title">{title}</h2>
          {species.common && <p className="modal__sci">{species.name}</p>}
          <div className="modal__badges">
            <EstablishmentBadge value={species.establishment} />
            {detail?.sizeCm != null && <span className="badge">Up to {formatSize(detail.sizeCm)}</span>}
            {detail?.conservationStatus && <span className="badge badge--status">{detail.conservationStatus}</span>}
            <span className="badge">{species.count.toLocaleString()} observations within 10 mi</span>
          </div>
          {detail ? (
            detail.summary ? (
              <p className="modal__summary">{detail.summary}</p>
            ) : (
              <p className="modal__summary muted">No Wikipedia summary is available for this species.</p>
            )
          ) : (
            <p className="modal__summary muted">Loading description…</p>
          )}
          <p className="modal__links">
            <a href={`https://www.inaturalist.org/taxa/${species.id}`} target="_blank" rel="noopener noreferrer">
              iNaturalist
            </a>
            {species.wikipediaUrl && (
              <a href={species.wikipediaUrl} target="_blank" rel="noopener noreferrer">
                Wikipedia
              </a>
            )}
          </p>
        </div>
      </div>
    </dialog>
  );
}
