'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { WorkoutRoute } from '@/lib/types/database'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface WorkoutRouteMapProps {
  route: WorkoutRoute
}

function speedToColor(speed: number, minSpeed: number, maxSpeed: number): string {
  if (maxSpeed <= minSpeed) return '#3b82f6'
  const ratio = (speed - minSpeed) / (maxSpeed - minSpeed)
  if (ratio < 0.33) return '#3b82f6' // blue — slow
  if (ratio < 0.66) return '#22c55e' // green — medium
  if (ratio < 0.85) return '#f97316' // orange — fast
  return '#ef4444' // red — very fast
}

export function WorkoutRouteMap({ route }: WorkoutRouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)

  const { segments, bounds } = useMemo(() => {
    const points = route.route_points
    if (!points || points.length < 2) return { segments: [], bounds: null }

    const speeds = points.map((p) => p.speed ?? 0).filter((s) => s > 0)
    const minSpeed = speeds.length ? Math.min(...speeds) : 0
    const maxSpeed = speeds.length ? Math.max(...speeds) : 0

    const segs: Array<{ from: [number, number]; to: [number, number]; color: string }> = []
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]
      const b = points[i + 1]
      const speed = b.speed ?? a.speed ?? 0
      segs.push({
        from: [a.lat, a.lng],
        to: [b.lat, b.lng],
        color: speedToColor(speed, minSpeed, maxSpeed),
      })
    }

    const latlngs = points.map((p) => L.latLng(p.lat, p.lng))
    const routeBounds = L.latLngBounds(latlngs)

    return { segments: segs, bounds: routeBounds }
  }, [route])

  useEffect(() => {
    if (!mapRef.current || segments.length === 0 || !bounds) return

    // Clean up previous instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map)

    for (const seg of segments) {
      L.polyline([seg.from, seg.to], {
        color: seg.color,
        weight: 4,
        opacity: 0.9,
      }).addTo(map)
    }

    const firstPt = segments[0].from
    const lastPt = segments[segments.length - 1].to

    L.circleMarker(firstPt, {
      radius: 6,
      fillColor: '#22c55e',
      color: '#fff',
      weight: 2,
      fillOpacity: 1,
    }).addTo(map)

    L.circleMarker(lastPt, {
      radius: 6,
      fillColor: '#ef4444',
      color: '#fff',
      weight: 2,
      fillOpacity: 1,
    }).addTo(map)

    // Fit bounds so route fills the map — padding keeps markers from edge
    map.fitBounds(bounds, { padding: [12, 12], maxZoom: 18 })

    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [segments, bounds])

  if (segments.length === 0) return null

  return (
    <div
      ref={mapRef}
      className="w-full rounded-xl overflow-hidden"
      style={{ height: 240 }}
    />
  )
}
