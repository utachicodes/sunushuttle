import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const TILE_SUBDOMAINS = 'abc';

export function createMap(container) {
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: true,
    scrollWheelZoom: false,
  });
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, subdomains: TILE_SUBDOMAINS, maxZoom: 20 }).addTo(map);
  map.setView([14.6937, -17.4441], 13);
  // The pane can still be settling into its flex size on first paint.
  requestAnimationFrame(() => map.invalidateSize());
  return map;
}

function stopIcon(isSelected, n) {
  return L.divIcon({
    className: '',
    html: `<span class="map-stop${isSelected ? ' sel' : ''}"><b>${n}</b></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function busIcon() {
  return L.divIcon({
    className: '',
    html: '<span class="map-bus"><span class="map-bus-ring"></span></span>',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

export function drawRoute(map, layerGroup, stops, selectedIndex, onSelectStop) {
  layerGroup.clearLayers();
  if (stops.length < 2) return;

  const latlngs = stops.map((s) => [s.lat, s.lng]);
  L.polyline(latlngs, { color: '#dd8a12', weight: 9, opacity: 0.55, lineCap: 'round' }).addTo(layerGroup);
  L.polyline(latlngs, { color: '#16305a', weight: 2.5, opacity: 0.95 }).addTo(layerGroup);

  stops.forEach((stop, i) => {
    const marker = L.marker([stop.lat, stop.lng], { icon: stopIcon(i === selectedIndex, i + 1) });
    marker.bindTooltip(stop.name, { direction: 'top', offset: [0, -8] });
    if (onSelectStop) marker.on('click', () => onSelectStop(i));
    marker.addTo(layerGroup);
  });
}

export function createLayerGroup(map) {
  return L.layerGroup().addTo(map);
}

export function fitToStops(map, stops) {
  if (!stops.length) return;
  const bounds = L.latLngBounds(stops.map((s) => [s.lat, s.lng]));
  map.fitBounds(bounds, { padding: [40, 40] });
}

/** A bus marker that animates between GPS fixes instead of jumping. */
export function createBusMarker(layerGroup, latlng, label) {
  const marker = L.marker(latlng, { icon: busIcon(), zIndexOffset: 1000 });
  if (label) marker.bindTooltip(label, { direction: 'top', offset: [0, -16], permanent: false });
  marker.addTo(layerGroup);

  let frame = null;
  marker._moveTo = (target, durationMs) => {
    if (frame) cancelAnimationFrame(frame);
    const from = marker.getLatLng();
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const lat = from.lat + (target[0] - from.lat) * t;
      const lng = from.lng + (target[1] - from.lng) * t;
      marker.setLatLng([lat, lng]);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  return marker;
}
