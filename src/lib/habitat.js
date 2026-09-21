/**
 * Habitat classification combining WoRMS flags with group-based defaults for
 * species WoRMS does not list (typically fully terrestrial animals).
 */
export const HABITATS = [
  { key: 'marine', label: 'Marine', emoji: '🌊', hint: 'Ocean and coastal salt water' },
  { key: 'brackish', label: 'Brackish', emoji: '🏞️', hint: 'Estuaries, salt marshes and lagoons' },
  { key: 'freshwater', label: 'Freshwater', emoji: '💧', hint: 'Rivers, lakes, ponds and wetlands' },
  { key: 'terrestrial', label: 'Terrestrial', emoji: '🌿', hint: 'Land' },
];

export const HABITAT_BY_KEY = Object.fromEntries(HABITATS.map((h) => [h.key, h]));

const GROUP_DEFAULTS = {
  fish: ['freshwater'],
  amphibians: ['freshwater', 'terrestrial'],
  mammals: ['terrestrial'],
  birds: ['terrestrial'],
  reptiles: ['terrestrial'],
  invertebrates: ['terrestrial'],
};

/**
 * @param {object} species  normalized iNaturalist species (needs .group)
 * @param {object|null|undefined} worms  record from lookupHabitats; undefined = not looked up yet
 * @returns {{ habitats: string[], source: 'worms'|'inferred' } | null}  null while WoRMS is still pending
 */
export function classifyHabitat(species, worms) {
  if (worms === undefined) return null;
  if (worms) {
    const flags = HABITATS.map((h) => h.key).filter((k) => worms[k]);
    if (flags.length) return { habitats: flags, source: 'worms' };
  }
  return { habitats: GROUP_DEFAULTS[species.group] || ['terrestrial'], source: 'inferred' };
}

export function isMarine(classification) {
  return !!classification && (classification.habitats.includes('marine') || classification.habitats.includes('brackish'));
}
