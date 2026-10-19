import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { CatalogClub, Progress } from './data.ts';
import { owned, progressStep } from './data.ts';
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

interface CountryCollection {
  type: 'FeatureCollection';
  features: { type: 'Feature'; properties: { code: string }; geometry: GeoJSON.MultiPolygon }[];
}

/**
 * Countries coloured by the share of their clubs I own. No tile layer: the outlines are the map. Colours come from
 * CSS classes (prog-0..5) so light and dark mode each use their own validated ramp. Associations too small to click
 * (Gibraltar, San Marino) also get a dot.
 */
export async function drawProgressMap(el: HTMLElement, progress: Map<string, Progress & { name: string }>): Promise<L.Map> {
  const map = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: false });
  const res = await fetch(`${import.meta.env.BASE_URL}data/countries.geo.json`);
  const geo = (await res.json()) as CountryCollection;
  const label = (code: string) => {
    const p = progress.get(code);
    return p ? `<strong>${esc(p.name)}</strong><br>${p.owned} of ${p.total} clubs` : esc(code);
  };
  const className = (code: string) => {
    const p = progress.get(code);
    return `country prog-${p ? progressStep(p) : 0}${p && p.total > 0 && p.owned === p.total ? ' complete' : ''}`;
  };
  const layer = L.geoJSON(geo as GeoJSON.FeatureCollection, {
    style: (f) => ({ className: className(f!.properties.code), weight: 1 }),
    onEachFeature: (f, l) => {
      const code = f.properties.code as string;
      l.bindTooltip(label(code), { sticky: true });
      l.on('click', () => (location.hash = href.association(code)));
    },
  });
  // Open on Europe (Iceland to the Caspian); Russia and Kazakhstan reach further east and are a pan away.
  // The view is set before the layer is added: Leaflet's vector renderer needs one.
  map.fitBounds([[34, -24], [71, 50]]);
  layer.addTo(map);
  for (const f of geo.features) {
    const bounds = L.geoJSON(f as GeoJSON.Feature).getBounds();
    if (bounds.getNorth() - bounds.getSouth() > 0.4 || bounds.getEast() - bounds.getWest() > 0.4) continue;
    L.circleMarker(bounds.getCenter(), { radius: 6, weight: 1, className: className(f.properties.code) })
      .bindTooltip(label(f.properties.code))
      .on('click', () => (location.hash = href.association(f.properties.code)))
      .addTo(map);
  }
  return map;
}
