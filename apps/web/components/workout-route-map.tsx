'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkoutRouteMeta } from '@/lib/types/database'
import { createClient } from '@/lib/supabase-browser'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface RoutePoint {
  lat: number
  lng: number
  alt?: number
  speed?: number
  ts?: string
}

interface WorkoutRouteMapProps {
  routeMeta: WorkoutRouteMeta
}

function speedToColor(speed: number, minSpeed: number, maxSpeed: number): string {
  if (maxSpeed <= minSpeed) return '#3b82f6'
  const ratio = (speed - minSpeed) / (maxSpeed - minSpeed)
  if (ratio < 0.33) return '#3b82f6' // blue — slow
  if (ratio < 0.66) return '#22c55e' // green — medium
  if (ratio < 0.85) return '#f97316' // orange — fast
  return '#ef4444' // red — very fast
}

export function WorkoutRouteMap({ routeMeta }: WorkoutRouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const [points, setPoints] = useState<RoutePoint[] | null>(null)

  // Fetch route_points on demand when this component mounts
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase
      .from('workout_routes')
      .select('route_points')
      .eq('id', routeMeta.id)
      .single()
      .then(({ data }) => {
        if (!cancelled && data?.route_points) {
          setPoints(data.route_points as RoutePoint[])
        }
      })
    return () => { cancelled = true }
  }, [routeMeta.id])

  const { segments, bounds } = useMemo(() => {
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
  }, [points])

  useEffect(() => {
    if (!mapRef.current || segments.length === 0 || !bounds) return

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

    map.fitBounds(bounds, { padding: [12, 12], maxZoom: 18 })
    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [segments, bounds])

  if (!points) {
    return (
      <div className="w-full rounded-xl bg-muted animate-pulse" style={{ height: 240 }} />
    )
  }

  if (segments.length === 0) return null

  return (
    <div
      ref={mapRef}
      className="w-full rounded-xl overflow-hidden"
      style={{ height: 240 }}
    />
  )
}
