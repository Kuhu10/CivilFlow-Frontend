import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Compass, Crosshair, Loader2, MapPin, MousePointer2, Navigation, Sparkles } from 'lucide-react';
import type { Incident } from '../api/types';
import './CityMap.css';

export const CHANDIGARH: [number, number] = [30.7333, 76.7794];

export const SECTOR_COORDINATES: Record<string, [number, number]> = {
  'Sector 1': [30.7592, 76.8048],
  'Sector 2': [30.7580, 76.7950],
  'Sector 8': [30.7420, 76.7990],
  'Sector 10': [30.7520, 76.7860],
  'Sector 15': [30.7510, 76.7680],
  'Sector 17': [30.7398, 76.7827],
  'Sector 22': [30.7280, 76.7720],
  'Sector 26': [30.7280, 76.8120],
  'Sector 34': [30.7180, 76.7680],
  'Sector 35': [30.7210, 76.7560],
  'Sector 43': [30.7160, 76.7440],
  'Sector 46': [30.7020, 76.7720],
  'Sector 52': [30.7050, 76.7320],
  'Manimajra': [30.7230, 76.8480],
  'Industrial Area Phase 1': [30.7100, 76.8080],
  'Industrial Area Phase 2': [30.6970, 76.8020],
  'Other': [30.7333, 76.7794],
};

export function findClosestSector(lat: number, lon: number): string {
  let closest = 'Sector 17';
  let minDistance = Infinity;

  for (const [sec, coords] of Object.entries(SECTOR_COORDINATES)) {
    if (sec === 'Other') continue;
    const dLat = (lat - coords[0]) * 111.0;
    const dLon = (lon - coords[1]) * 111.0 * Math.cos((lat * Math.PI) / 180);
    const dist = dLat * dLat + dLon * dLon;
    if (dist < minDistance) {
      minDistance = dist;
      closest = sec;
    }
  }
  return closest;
}

const customPinIcon = L.divIcon({
  className: 'civicflow-map-marker',
  html: `
    <div class="marker-pin-outer">
      <div class="marker-pin-inner">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
      </div>
      <div class="marker-pulse"></div>
    </div>
  `,
  iconSize: [36, 44],
  iconAnchor: [18, 42],
  popupAnchor: [0, -42],
});

const withinChandigarhView = (item: Incident) =>
  item.latitude != null &&
  item.longitude != null &&
  item.latitude >= 30.60 &&
  item.latitude <= 30.88 &&
  item.longitude >= 76.63 &&
  item.longitude <= 76.94;

const pointColour = (severity: string) =>
  ({ critical: '#b83d33', high: '#d36b3f', medium: '#d6a33a', low: '#438a69' }[severity] || '#3f7391');

// Controller component to safely center map when coordinates or sector changes
function MapCameraController({ center, zoom }: { center: [number, number]; zoom?: number }) {
  const map = useMap();
  const lastTarget = useRef<string>('');

  useEffect(() => {
    if (!center || isNaN(center[0]) || isNaN(center[1])) return;
    const key = `${center[0].toFixed(5)},${center[1].toFixed(5)},${zoom || ''}`;
    if (lastTarget.current === key) return;
    lastTarget.current = key;

    try {
      map.stop();
      map.setView(center, zoom ?? Math.max(map.getZoom(), 14), { animate: false });
    } catch {
      // Map instance may be disposing
    }

    return () => {
      try {
        map.stop();
      } catch {
        // Safe unmount
      }
    };
  }, [center, zoom, map]);

  return null;
}

function PickClick({ onChoose }: { onChoose: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      onChoose(Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6)));
    },
  });
  return null;
}

export interface LocationPickerProps {
  value: { lat: number; lon: number } | null;
  onChange: (value: { lat: number; lon: number } | null) => void;
  selectedSector?: string;
  onSectorDetected?: (sector: string) => void;
  onLocationDescriptionSuggest?: (description: string) => void;
}

export function LocationPicker({
  value,
  onChange,
  selectedSector,
  onSectorDetected,
  onLocationDescriptionSuggest,
}: LocationPickerProps) {
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [isGpsActive, setIsGpsActive] = useState(false);

  // Determine current active map center
  const activeCenter: [number, number] = useMemo(() => {
    if (value) return [value.lat, value.lon];
    if (selectedSector && SECTOR_COORDINATES[selectedSector]) {
      return SECTOR_COORDINATES[selectedSector];
    }
    return CHANDIGARH;
  }, [value, selectedSector]);

  const activeSectorName = useMemo(() => {
    if (value) return findClosestSector(value.lat, value.lon);
    return selectedSector || 'Chandigarh';
  }, [value, selectedSector]);

  // Request high-accuracy GPS from device in the field
  const handleAcquireFieldLocation = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    setGpsBusy(true);
    setGpsError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lon = Number(pos.coords.longitude.toFixed(6));
        const acc = Math.round(pos.coords.accuracy);

        setGpsAccuracy(acc);
        setIsGpsActive(true);
        setGpsBusy(false);

        // Update coordinates
        onChange({ lat, lon });

        // Synchronize closest sector
        const closest = findClosestSector(lat, lon);
        onSectorDetected?.(closest);
        onLocationDescriptionSuggest?.(`Field GPS near ${closest} (±${acc}m accuracy)`);
      },
      (err) => {
        setGpsBusy(false);
        let msg = 'Unable to fetch field GPS coordinates.';
        if (err.code === 1) msg = 'Location access permission was denied.';
        else if (err.code === 2) msg = 'Location unavailable or no GPS signal.';
        else if (err.code === 3) msg = 'Location request timed out.';
        setGpsError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const handleMapPick = (lat: number, lon: number) => {
    setIsGpsActive(false);
    setGpsAccuracy(null);
    setGpsError('');
    onChange({ lat, lon });

    // Sync sector dropdown
    const closest = findClosestSector(lat, lon);
    onSectorDetected?.(closest);
    onLocationDescriptionSuggest?.(`Near ${closest}`);
  };

  const handleRecenterSector = () => {
    if (selectedSector && SECTOR_COORDINATES[selectedSector]) {
      const coords = SECTOR_COORDINATES[selectedSector];
      onChange({ lat: coords[0], lon: coords[1] });
      setIsGpsActive(false);
      setGpsAccuracy(null);
      onLocationDescriptionSuggest?.(`Near ${selectedSector}`);
    }
  };

  return (
    <div className="location-map-wrap">
      {/* Synchronization Toolbar */}
      <div className="map-sync-toolbar">
        <div className="map-sync-left">
          <button
            type="button"
            className="map-gps-btn"
            onClick={handleAcquireFieldLocation}
            disabled={gpsBusy}
            title="Detect precise field location via device GPS"
          >
            {gpsBusy ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
            <span>{gpsBusy ? 'Acquiring GPS…' : 'Use Field GPS Location'}</span>
          </button>

          {selectedSector && (
            <button
              type="button"
              className="map-center-sector-btn"
              onClick={handleRecenterSector}
              title={`Center map on ${selectedSector}`}
            >
              <Compass size={14} />
              <span>Center on {selectedSector}</span>
            </button>
          )}
        </div>

        <div className="map-sync-right">
          {isGpsActive ? (
            <span className="map-sync-badge live-gps">
              <Crosshair size={12} /> Live GPS Synced
            </span>
          ) : (
            <span className="map-sync-badge">
              <Sparkles size={12} /> Two-Way Sync Active
            </span>
          )}
        </div>
      </div>

      {gpsError && <div className="map-gps-error">{gpsError}</div>}

      <div className="map-helper-text">
        <MousePointer2 size={14} />
        <span>Tap anywhere or use GPS — sector dropdown and map stay synchronized.</span>
        <span className="optional">Optional</span>
      </div>

      {/* Leaflet Interactive Map */}
      <MapContainer center={activeCenter} zoom={value ? 15 : 13} scrollWheelZoom className="leaflet-map picker-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapCameraController center={activeCenter} zoom={value ? 15 : 14} />
        <PickClick onChoose={handleMapPick} />
        {value && <Marker position={[value.lat, value.lon]} icon={customPinIcon} />}
      </MapContainer>

      {/* Synchronized Footer Information */}
      <div className="map-location-footer-v2">
        {value ? (
          <>
            <div className="map-coords-badge">
              <MapPin size={14} style={{ color: '#2563eb' }} />
              <span className="map-coords-tag">{value.lat.toFixed(5)}, {value.lon.toFixed(5)}</span>
              <span className="map-sector-tag">📍 {activeSectorName}</span>
              {gpsAccuracy && <span className="map-accuracy-tag">±{gpsAccuracy}m GPS</span>}
            </div>
            <button
              type="button"
              className="map-clear-btn"
              onClick={() => {
                onChange(null);
                setIsGpsActive(false);
                setGpsAccuracy(null);
              }}
            >
              Clear Pin
            </button>
          </>
        ) : (
          <span style={{ color: '#64748b', fontSize: '12px' }}>
            No map pin placed yet. Select a sector or tap the map to place a pin.
          </span>
        )}
      </div>
    </div>
  );
}

export function CityMap({
  incidents,
  selectedId,
  onSelect,
  height = '430px',
}: {
  incidents: Incident[];
  selectedId?: string;
  onSelect?: (incident: Incident) => void;
  height?: string;
}) {
  const mapIncidents = useMemo(() => incidents.filter(withinChandigarhView), [incidents]);
  const outsideCount = incidents.filter(
    (item) => item.latitude != null && item.longitude != null && !withinChandigarhView(item)
  ).length;
  const mapStyle = { '--map-height': height } as CSSProperties;

  return (
    <div className="city-map-shell" style={mapStyle}>
      <MapContainer center={CHANDIGARH} zoom={12} scrollWheelZoom className="leaflet-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {mapIncidents.map((item) => (
          <CircleMarker
            key={item.id}
            center={[item.latitude!, item.longitude!]}
            radius={selectedId === item.id ? 10 : 7}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: pointColour(item.severity),
              fillOpacity: 0.96,
            }}
            eventHandlers={{ click: () => onSelect?.(item) }}
          >
            <Popup>
              <div className="map-popup">
                <span>{item.incident_code}</span>
                <strong>{item.title || item.category}</strong>
                <small>
                  {item.sector} · {item.status.replace('_', ' ')}
                </small>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {mapIncidents.length === 0 && (
        <div className="map-empty-overlay">
          <span>
            <MapPin size={18} />
          </span>
          <b>No mapped reports yet</b>
          <p>Reports appear here when they have coordinates inside the Chandigarh map area.</p>
        </div>
      )}
      <div className="map-bottom-note">
        <span>
          <i className="map-dot map-dot-high" /> High
        </span>
        <span>
          <i className="map-dot map-dot-medium" /> Medium
        </span>
        <span>
          <i className="map-dot map-dot-low" /> Low
        </span>
        <em>{mapIncidents.length} mapped</em>
      </div>
      {outsideCount > 0 && (
        <div className="map-caveat">
          {outsideCount} report(s) with coordinates outside this Chandigarh view are not shown on this map.
        </div>
      )}
    </div>
  );
}
