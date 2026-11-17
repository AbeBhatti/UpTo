'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { CAMPUS_CENTER, CAMPUS_ZOOM, type PinGroup } from './pins';
import styles from './map.module.css';

/** OpenFreeMap's dark style: free, no API key. */
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const FOCUS_ZOOM = 17;
/** Pin titles show from this zoom; below it they would pile on each other. */
const LABEL_ZOOM = 16.5;

interface MapCanvasProps {
  groups: PinGroup[];
  selectedKey: string | null;
  onSelectGroup: (group: PinGroup) => void;
}

/**
 * MapLibre over SCU with one HTML pin per place. MapLibre needs the browser,
 * so it is imported inside the effect; the server renders only the empty box.
 */
export function MapCanvas({ groups, selectedKey, onSelectGroup }: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const markerClass = useRef<typeof Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [labels, setLabels] = useState(false);
  const framed = useRef(false);
  // Latest handler without rebuilding every pin when it changes.
  const onSelect = useRef(onSelectGroup);
  onSelect.current = onSelectGroup;

  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | null = null;
    import('maplibre-gl')
      .then((maplibre) => {
        if (cancelled || !container.current) return;
        markerClass.current = maplibre.Marker;
        instance = new maplibre.Map({
          container: container.current,
          style: MAP_STYLE,
          center: [CAMPUS_CENTER.lng, CAMPUS_CENTER.lat],
          zoom: CAMPUS_ZOOM,
          attributionControl: { compact: true },
        });
        instance.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
        instance.on('error', (event) => console.error('Map error:', event.error));
        // Start the credits folded to their (i) button; they open on a tap.
        instance.once('load', () => {
          container.current?.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
        });
        const showLabels = () => setLabels(instance!.getZoom() >= LABEL_ZOOM);
        instance.on('zoomend', showLabels);
        showLabels();
        map.current = instance;
        setReady(true);
      })
      .catch((error) => {
        // No WebGL, or the library failed to load: the list still works.
        console.error('Map could not start:', error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      instance?.remove();
      map.current = null;
    };
  }, []);

  // One pin per place; rebuilt when the places (the search) change.
  useEffect(() => {
    const Marker = markerClass.current;
    if (!ready || !map.current || !Marker) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = groups.map((group) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = styles.pin;
      element.dataset.key = group.key;
      const first = group.events[0];
      const more = group.events.length - 1;
      element.setAttribute('aria-label', more > 0 ? `${first.title} and ${more} more` : first.title);
      element.style.setProperty('--pin-accent', `var(--up-cat-${first.category ?? 'invite'}-accent, var(--up-border-strong))`);

      const dot = document.createElement('span');
      dot.className = styles.pinDot;
      dot.textContent = group.events.length > 1 ? String(group.events.length) : '';
      if (group.events.some((event) => event.isLiveNow)) dot.dataset.live = 'true';

      const label = document.createElement('span');
      label.className = styles.pinLabel;
      label.textContent = first.title;
      element.append(dot, label);
      if (more > 0) {
        const extra = document.createElement('span');
        extra.className = styles.pinMore;
        extra.textContent = `+${more} more`;
        element.append(extra);
      }

      element.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelect.current(group);
      });
      return new Marker({ element, anchor: 'top' }).setLngLat([group.lng, group.lat]).addTo(map.current!);
    });

    // Open on every pin, once.
    if (!framed.current && groups.length > 0) {
      framed.current = true;
      const lngs = groups.map((group) => group.lng);
      const lats = groups.map((group) => group.lat);
      map.current.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 80, maxZoom: FOCUS_ZOOM, duration: 0 },
      );
    }
  }, [groups, ready]);

  // Highlight and fly to the chosen place.
  useEffect(() => {
    for (const marker of markers.current) {
      const element = marker.getElement();
      element.dataset.selected = String(element.dataset.key === selectedKey);
    }
    const group = groups.find((candidate) => candidate.key === selectedKey);
    if (group && map.current) {
      map.current.flyTo({ center: [group.lng, group.lat], zoom: Math.max(map.current.getZoom(), FOCUS_ZOOM), essential: true });
    }
  }, [selectedKey, groups, ready]);

  return (
    <div className={styles.canvas} data-labels={labels}>
      <div ref={container} className={styles.mapBox} data-testid="map-canvas" />
      {failed ? <p className={styles.mapProblem}>The map couldn&apos;t load. The list still works.</p> : null}
    </div>
  );
}
