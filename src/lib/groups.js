/**
 * iNaturalist taxon IDs used to define each animal group.
 *   Animalia 1, Vertebrata 355675, Aves 3, Amphibia 20978, Reptilia 26036,
 *   Mammalia 40151, Insecta 47158.
 * Fish = vertebrates minus the four tetrapod classes, so sharks, rays and
 * lampreys are included, not just ray-finned fishes.
 * Invertebrates = all animals minus vertebrates and insects.
 */
export const GROUPS = [
  { key: 'mammals', label: 'Mammals', emoji: '🦌', taxonId: 40151, withoutTaxonIds: [] },
  { key: 'birds', label: 'Birds', emoji: '🐦', taxonId: 3, withoutTaxonIds: [] },
  { key: 'reptiles', label: 'Reptiles', emoji: '🦎', taxonId: 26036, withoutTaxonIds: [] },
  { key: 'amphibians', label: 'Amphibians', emoji: '🐸', taxonId: 20978, withoutTaxonIds: [] },
  { key: 'fish', label: 'Fish', emoji: '🐟', taxonId: 355675, withoutTaxonIds: [40151, 3, 26036, 20978] },
  { key: 'invertebrates', label: 'Invertebrates', emoji: '🦀', taxonId: 1, withoutTaxonIds: [355675, 47158] },
];

export const GROUP_BY_KEY = Object.fromEntries(GROUPS.map((g) => [g.key, g]));

/** Search radius: 10 miles, expressed in km for the iNaturalist API. */
export const RADIUS_MILES = 10;
export const RADIUS_KM = Math.round(RADIUS_MILES * 1.609344 * 100) / 100;

/** Extended radius for marine life at coastal locations. */
export const EXTENDED_RADIUS_MILES = 30;
export const EXTENDED_RADIUS_KM = Math.round(EXTENDED_RADIUS_MILES * 1.609344 * 100) / 100;

/** Groups worth re-querying offshore; amphibians are never marine. */
export const OFFSHORE_GROUP_KEYS = ['fish', 'invertebrates', 'mammals', 'reptiles', 'birds'];

export function milesToKm(mi) {
  return Math.round(mi * 1.609344 * 100) / 100;
}
