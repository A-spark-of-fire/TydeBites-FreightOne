/**
 * Vessel sea-route map (visual only)
 * ---------------------------------------------------------------------------
 * Rules:
 *  1. Polylines stay on WATER only — never across continents or Sri Lanka.
 *  2. East-Coast India approaches ALWAYS pass SOUTH of Sri Lanka
 *     (open sea ~5.2°N, 82°E) then into Bay of Bengal. Never Palk Strait.
 *  3. Brazil / USA / long-haul Atlantic routes round Africa SOUTH of
 *     Cape Agulhas (~37°S) — never cut the African landmass.
 *  4. Covered path = green dashed; remaining = yellow (red if delayed/risk).
 *  5. Reroute = cyan, from CURRENT ship position → nearby alt East-Coast port.
 * ---------------------------------------------------------------------------
 */
import { useMemo } from 'react';
import {
  MapContainer, TileLayer, Polyline, CircleMarker, Popup, Tooltip, Marker,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const SHIP_ICON = new L.DivIcon({
  className: 'ship-marker',
  html: `<div style="font-size:22px;filter:drop-shadow(0 1px 2px #000)">🚢</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/* ================================================================== */
/* Shared maritime waypoints (all open water)                          */
/* ================================================================== */

/** South of Sri Lanka — mandatory gate into Bay of Bengal */
const SOUTH_OF_SRI_LANKA = [5.2, 82.0];
const BOB_ENTRY = [8.5, 85.0];
const BOB_MID = [13.0, 86.0];

/** Final approach legs inside Bay of Bengal (all water) */
const TO_PARADIP = [BOB_MID, [17.0, 86.5], [20.2644, 86.6947]];
const TO_HALDIA = [BOB_MID, [18.0, 88.0], [20.5, 88.3], [22.0333, 88.10]];
const TO_VIZAG = [[11.0, 84.5], [14.5, 83.5], [17.6868, 83.2185]];
const TO_GANGAVARAM = [[11.0, 84.5], [14.5, 83.5], [17.6167, 83.2333]];

function finishTo(destKey) {
  if (destKey === 'haldia') return TO_HALDIA;
  if (destKey === 'vizag') return TO_VIZAG;
  if (destKey === 'gangavaram') return TO_GANGAVARAM;
  return TO_PARADIP;
}

/** Append south-of-SL gate + BoB finish */
function viaSouthSL(prefix, destKey) {
  return [...prefix, SOUTH_OF_SRI_LANKA, BOB_ENTRY, ...finishTo(destKey)];
}

/**
 * Round Africa SOUTH of Cape Agulhas (southern tip ~34.8°S, 20°E).
 * Stay at ~37°S through the meridian of the Cape so densified segments
 * never intersect the African coastline.
 */
function viaCapeOfGoodHope(fromBrazilOrAtlantic) {
  return [
    ...fromBrazilOrAtlantic,
    // Deep south Atlantic — clear of Africa
    [-36.0, -10.0],
    [-37.5, 5.0],
    [-37.5, 18.0],   // due south of Cape Town / Agulhas, still offshore
    [-37.0, 25.0],   // enter Indian Ocean well south of land
    [-34.0, 35.0],   // SE of South Africa, open ocean
    [-28.0, 45.0],   // offshore of Madagascar south tip
    [-20.0, 55.0],   // central west Indian Ocean
    [-10.0, 65.0],
    [-2.0, 72.0],
    [2.0, 78.0],     // approach Sri Lanka from the southwest (ocean)
  ];
}

/* ================================================================== */
/* Full origin → dest water corridors                                  */
/* ================================================================== */

function buildRoutes() {
  const dests = ['paradip', 'haldia', 'vizag', 'gangavaram'];
  const routes = {};

  // ---- Australia (Port Hedland) ----
  const ausPrefix = [
    [-20.31, 118.58], // Port Hedland
    [-18.5, 116.0],   // NW offshore
    [-14.0, 110.0],   // open Indian Ocean
    [-8.0, 100.0],
    [-2.0, 90.0],
    [2.0, 84.0],
  ];
  dests.forEach((d) => {
    routes[`australia__${d}`] = viaSouthSL(ausPrefix, d);
  });

    // ---- Indonesia ----
  const indoPrefix = [
    [-6.10, 106.88], // Tanjung Priok / Kalimantan side
    [-5.0, 102.0],
    [-2.0, 95.0],
    [1.0, 88.0],
    [3.0, 84.0],
  ];
  dests.forEach((d) => {
    routes[`indonesia__${d}`] = viaSouthSL(indoPrefix, d);
  });

    // ---- Mozambique (Maputo) — channel west of Madagascar ----
  const mozPrefix = [
    [-25.97, 32.59], // Maputo
    [-25.0, 35.5],   // offshore
    [-22.0, 39.0],   // south channel
    [-17.0, 41.0],   // mid channel (island shore ~44°E+)
    [-12.0, 42.0],   // north channel, west of Cap d'Ambre
    [-8.0, 48.0],    // north of Madagascar
    [-4.0, 58.0],
    [0.0, 70.0],
    [2.5, 78.0],
  ];
  dests.forEach((d) => {
    routes[`mozambique__${d}`] = viaSouthSL(mozPrefix, d);
  });

    // ---- South Africa (Richards Bay) — south of Madagascar ----
  const saPrefix = [
    [-28.78, 32.04], // Richards Bay
    [-30.5, 35.0],   // SE offshore
    [-32.0, 40.0],
    [-31.0, 48.0],   // south of Madagascar (~25°S tip)
    [-28.0, 55.0],   // clear east of island
    [-18.0, 62.0],
    [-8.0, 70.0],
    [0.0, 76.0],
    [2.5, 78.5],
  ];
  dests.forEach((d) => {
    routes[`south_africa__${d}`] = viaSouthSL(saPrefix, d);
  });

    // ---- UAE (Jebel Ali) — south of India, not over land ----
  const uaePrefix = [
    [25.01, 55.06], // Jebel Ali
    [20.0, 60.0],
    [12.0, 66.0],
    [7.0, 72.0],    // south of India (tip ~8.1°N, 77.5°E)
    [5.5, 78.0],    // Laccadive / open sea
  ];
  dests.forEach((d) => {
    routes[`uae__${d}`] = viaSouthSL(uaePrefix, d);
  });

    // ---- Brazil — south of Cape Agulhas, south of Madagascar ----
  const brazilStart = [
    [-23.96, -46.33], // Santos / Tubarao region
    [-28.0, -40.0],
    [-32.0, -25.0],
    [-36.0, -10.0],
    [-37.5, 5.0],
    [-37.5, 18.0],  // due south of Cape Agulhas
    [-37.0, 26.0],
    [-34.0, 36.0],
    [-32.0, 48.0],  // south of Madagascar
    [-28.0, 56.0],
    [-18.0, 64.0],
    [-8.0, 72.0],
    [2.0, 78.0],
  ];
  dests.forEach((d) => {
    routes[`brazil__${d}`] = viaSouthSL(brazilStart, d);
  });

    // ---- USA Gulf — Atlantic → south of Cape → south of Madagascar ----
  const usaStart = [
    [29.95, -90.07],
    [25.0, -70.0],
    [15.0, -45.0],
    [0.0, -25.0],
    [-15.0, -10.0],
    [-28.0, 0.0],
    [-36.0, -8.0],
    [-37.5, 5.0],
    [-37.5, 18.0],
    [-37.0, 26.0],
    [-34.0, 36.0],
    [-32.0, 48.0],
    [-28.0, 56.0],
    [-18.0, 64.0],
    [-8.0, 72.0],
    [2.0, 78.0],
  ];
  dests.forEach((d) => {
    routes[`usa__${d}`] = viaSouthSL(usaStart, d);
  });

    // ---- Oman (Sohar) — south of India ----
  const omanPrefix = [
    [24.36, 56.74], // Sohar
    [20.0, 60.0],
    [12.0, 66.0],
    [7.0, 72.0],
    [5.5, 78.0],
  ];
  dests.forEach((d) => {
    routes[`oman__${d}`] = viaSouthSL(omanPrefix, d);
  });

  return routes;
}

const SEA_ROUTES = buildRoutes();

const ALT_PORTS = {
  haldia: { code: 'paradip', label: 'Paradip Port', coords: [20.2644, 86.6947] },
  paradip: { code: 'vizag', label: 'Visakhapatnam Port', coords: [17.6868, 83.2185] },
  vizag: { code: 'gangavaram', label: 'Gangavaram Port', coords: [17.6167, 83.2333] },
  gangavaram: { code: 'vizag', label: 'Visakhapatnam Port', coords: [17.6868, 83.2185] },
};

function densify(points, stepsPerSeg = 5) {
  if (!points || points.length < 2) return points || [];
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (let s = 0; s < stepsPerSeg; s++) {
      const t = s / stepsPerSeg;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function getSeaPath(originKey, destKey, originCoords, destCoords) {
  const key = `${originKey}__${destKey}`;
  const known = SEA_ROUTES[key];
  if (known) return densify(known, 5);
  return densify(viaSouthSL([originCoords, [0, (originCoords[1] + destCoords[1]) / 2]], destKey), 5);
}

function getReroutePath(shipPos, originKey, currentDestKey) {
  if (!shipPos) return null;
  const alt = ALT_PORTS[currentDestKey];
  if (!alt?.coords) return null;

  const [lat] = shipPos;
  if (lat >= 7) {
    return densify([shipPos, BOB_MID, ...finishTo(alt.code).slice(1)], 4);
  }

  const sample = SEA_ROUTES[`${originKey}__${alt.code}`];
  if (sample && sample.length >= 4) {
    const idx = sample.findIndex((p) => p[0] >= 5);
    const approach = idx >= 0 ? sample.slice(idx) : sample.slice(-6);
    return densify([shipPos, ...approach], 4);
  }

  return densify([shipPos, SOUTH_OF_SRI_LANKA, BOB_ENTRY, ...finishTo(alt.code)], 4);
}

function splitByProgress(path, pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0)) / 100;
  if (!path.length) return { covered: [], remaining: [], shipPos: null };
  const idx = Math.max(0, Math.min(path.length - 1, Math.floor(p * (path.length - 1))));
  return {
    covered: path.slice(0, idx + 1),
    remaining: path.slice(idx),
    shipPos: path[idx],
  };
}

export default function VesselMap({ consignment, originCoords, destCoords, onClose }) {
  const c = consignment;
  const originKey = c.origin || 'australia';
  const destKey = c.port || 'paradip';
  const delayed = String(c.status || '').toLowerCase() === 'delayed';
  const congestion =
    delayed ||
    String(c.risk_flag || '').toLowerCase() === 'high' ||
    !!c.reroute_suggested;

  const fullPath = useMemo(
    () => getSeaPath(originKey, destKey, originCoords, destCoords),
    [originKey, destKey, originCoords, destCoords],
  );

  const { covered, remaining, shipPos } = useMemo(
    () => splitByProgress(fullPath, c.progress_pct ?? 0),
    [fullPath, c.progress_pct],
  );

  const alt = ALT_PORTS[destKey];
  const showReroute = !!(c.reroute_suggested || delayed) && alt && shipPos;

  const reroutePath = useMemo(() => {
    if (!showReroute) return null;
    return getReroutePath(shipPos, originKey, destKey);
  }, [showReroute, shipPos, originKey, destKey]);

  const remainingColor = congestion ? '#e06b67' : '#edb353';
  const center = shipPos || originCoords;

  return (
    <div className="vessel-map-wrap">
      <div className="vessel-map-head">
        <div>
          <b>{c.id}</b> · {c.vessel}
          <small>
            {c.origin_label || originKey} → {c.port_label || destKey}
            {' · '}
            {c.progress_pct || 0}% covered
            {showReroute && alt ? ` · Reroute → ${alt.label}` : ''}
          </small>
        </div>
        <button type="button" className="secondary small" onClick={onClose}>
          Close map
        </button>
      </div>

      <div className="vessel-map-legend">
        <span><i style={{ background: '#34b58a' }} /> Covered (sea)</span>
        <span>
          <i style={{ background: remainingColor }} /> Remaining
          {congestion ? ' (risk)' : ''}
        </span>
        {showReroute && (
          <span><i style={{ background: '#4dc1ca' }} /> Reroute from ship → {alt.label}</span>
        )}
        <span>🚢 Live position</span>
      </div>

      <MapContainer
        center={center}
        zoom={3}
        style={{ height: 420, width: '100%', borderRadius: 12 }}
        scrollWheelZoom
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <CircleMarker
          center={originCoords}
          radius={7}
          pathOptions={{ color: '#4d95ef', fillColor: '#4d95ef', fillOpacity: 0.9 }}
        >
          <Tooltip permanent direction="top">{c.origin_label || originKey}</Tooltip>
        </CircleMarker>

        <CircleMarker
          center={destCoords}
          radius={7}
          pathOptions={{ color: '#edb353', fillColor: '#edb353', fillOpacity: 0.9 }}
        >
          <Tooltip permanent direction="top">{c.port_label || destKey}</Tooltip>
        </CircleMarker>

        {showReroute && alt && (
          <CircleMarker
            center={alt.coords}
            radius={7}
            pathOptions={{ color: '#4dc1ca', fillColor: '#4dc1ca', fillOpacity: 0.9 }}
          >
            <Tooltip permanent direction="bottom">Alt: {alt.label}</Tooltip>
          </CircleMarker>
        )}

        <Polyline
          positions={covered}
          pathOptions={{ color: '#34b58a', weight: 3, dashArray: '8 6', opacity: 0.95 }}
        />
        <Polyline
          positions={remaining}
          pathOptions={{ color: remainingColor, weight: 3, dashArray: '8 6', opacity: 0.9 }}
        />
        {reroutePath && (
          <Polyline
            positions={reroutePath}
            pathOptions={{ color: '#4dc1ca', weight: 3, dashArray: '4 8', opacity: 0.9 }}
          />
        )}

        {shipPos && (
          <Marker position={shipPos} icon={SHIP_ICON}>
            <Popup>
              <div style={{ minWidth: 180, fontSize: 12 }}>
                <b>{c.vessel}</b>
                <br />
                ID: {c.id}
                <br />
                {c.material_label || c.material} ·{' '}
                {c.tonnage?.toLocaleString?.() || c.tonnage} MT
                <br />
                Progress: {c.progress_pct || 0}%
                <br />
                Status: {c.status}
                {c.delay_days ? ` (+${c.delay_days}d)` : ''}
                <br />
                Port ETA: {c.eta_port_date || '—'}
                <br />
                Position: {c.position || 'At sea'}
                {showReroute && alt && (
                  <>
                    <br />
                    <b style={{ color: '#0aa' }}>Reroute → {alt.label}</b>
                  </>
                )}
              </div>
            </Popup>
            <Tooltip direction="top" offset={[0, -10]}>
              {c.vessel} · {c.progress_pct || 0}%
            </Tooltip>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
