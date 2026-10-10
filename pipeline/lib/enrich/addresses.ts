import { getJson } from '../http.ts';
import type { AddressInfo, Stadium } from '../types.ts';

interface Reverse {
  osm_type?: string;
  osm_id?: number;
  address?: Record<string, string>;
}

/** "Strada Giulești 18, 060271 București" from Nominatim address parts; local language, no country. */
export function formatAddress(a: Record<string, string>): string | undefined {
  const street = [a.road ?? a.pedestrian ?? a.square, a.house_number].filter(Boolean).join(' ');
  const place = a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb;
  const locality = [a.postcode, place].filter(Boolean).join(' ');
  const text = [street, locality].filter(Boolean).join(', ');
  return text || undefined;
}

/** Reverse-geocodes a stadium with Nominatim: at most 1 request per second, cached in the repo. */
export async function fetchAddress(s: Stadium, opts: { refresh?: boolean } = {}): Promise<AddressInfo | undefined> {
  if (s.lat === undefined || s.lon === undefined) return undefined;
  const url = `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({
    format: 'jsonv2',
    lat: s.lat.toFixed(6),
    lon: s.lon.toFixed(6),
    zoom: '18',
    addressdetails: '1',
  })}`;
  const r = await getJson<Reverse>(url, { cache: true, maxAgeDays: 365, refresh: opts.refresh, minIntervalMs: 1100 });
  const text = r?.address && formatAddress(r.address);
  if (!text) return undefined;
  return {
    text,
    ...(r.osm_type && r.osm_id ? { osmUrl: `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}` } : {}),
  };
}
