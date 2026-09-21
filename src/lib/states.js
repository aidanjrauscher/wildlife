/** US state and DC names to USPS codes, used to normalize geocoder output. */
export const STATE_CODES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE',
  nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA',
  washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

export const STATE_NAMES = Object.fromEntries(Object.entries(STATE_CODES).map(([name, code]) => [code, name.replace(/\b\w/g, (c) => c.toUpperCase()).replace('Of', 'of')]));

export const VALID_STATES = new Set(Object.values(STATE_CODES));

/** Accepts "Pennsylvania", "PA", "pa", or "US-PA" and returns "PA" or null. */
export function toStateCode(value) {
  if (!value) return null;
  const v = String(value).trim();
  const iso = v.match(/^US-([A-Z]{2})$/i);
  if (iso) return VALID_STATES.has(iso[1].toUpperCase()) ? iso[1].toUpperCase() : null;
  if (/^[a-z]{2}$/i.test(v)) return VALID_STATES.has(v.toUpperCase()) ? v.toUpperCase() : null;
  return STATE_CODES[v.toLowerCase()] || null;
}

/** Reverse-geocode a point to a state code via Nominatim (used only when the forward geocoder gave none). */
export async function stateForCoords(lat, lng, signal) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=5`;
  const resp = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!resp.ok) return null;
  const data = await resp.json();
  return toStateCode(data?.address?.['ISO3166-2-lvl4']) || toStateCode(data?.address?.state);
}

/** Census FIPS codes (as used by us-atlas) to USPS codes. */
export const FIPS_TO_CODE = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY',
};
