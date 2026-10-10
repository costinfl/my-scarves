import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { CatalogClub } from './data.ts';
import { owned } from './data.ts';
import { esc } from './html.ts';
import { href } from './router.ts';

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Draws one marker per club stadium. Circle markers avoid Leaflet's default PNG icons,
 * whose relative URLs break once a bundler moves the CSS.
 */
export function drawMap(el: HTMLElement, clubs: CatalogClub[], opts: { zoom?: number } = {}): L.Map {
  const map = L.map(el, { scrollWheelZoom: false });
  L.tileLayer(TILES, { maxZoom: 18, attribution: ATTRIBUTION }).addTo(map);

  const points: L.LatLngExpression[] = [];
  for (const c of clubs) {
    const s = c.stadium;
    if (s?.lat === undefined || s.lon === undefined) continue;
    points.push([s.lat, s.lon]);
    const have = owned(c);
    L.circleMarker([s.lat, s.lon], {
      radius: 7,
      weight: 2,
      color: have ? '#1b7f3b' : '#555',
      fillColor: have ? '#2fbf5f' : '#999',
      fillOpacity: 0.8,
    })
      .bindPopup(`<a href="${href.club(c.qid)}"><strong>${esc(c.name)}</strong></a><br>${esc(s.name)}`)
      .addTo(map);
  }

  if (points.length === 1) map.setView(points[0]!, opts.zoom ?? 14);
  else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
  else map.setView([50, 10], 4);
  return map;
}
