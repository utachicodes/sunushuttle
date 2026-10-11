import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function createMap(container) {
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: true,
    scrollWheelZoom: false,
  });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
  map.setView([14.6937, -17.4441], 13);
  return map;
}

function stopIcon(isSelected) {
  return L.divIcon({
    className: '',
    html: `<span class="map-stop${isSelected ? ' sel' : ''}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function busIcon() {
  return L.divIcon({
    className: '',
    html: '<span class="map-bus"></span>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export function drawRoute(map, layerGroup, stops, selectedIndex, onSelectStop) {
  layerGroup.clearLayers();
  if (stops.length < 2) return;

  const latlngs = stops.map((s) => [s.lat, s.lng]);
  L.polyline(latlngs, { color: '#0f2c50', weight: 4, opacity: 0.85 }).addTo(layerGroup);

  stops.forEach((stop, i) => {
    const marker = L.marker([stop.lat, stop.lng], { icon: stopIcon(i === selectedIndex) });
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
