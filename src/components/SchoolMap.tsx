/**
 * Leaflet 지도. 타일은 OpenStreetMap (이용 정책·표시 준수, 오프라인 대량 저장 없음).
 * 타일 실패 시 학교 점·행정경계(있으면)만으로 기능을 유지한다. 유료 키 불필요.
 */
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { School } from '@shared/types'
import { haversineKm, formatStraightLine } from '@shared/geo'

export interface MapOrigin { lat: number; lng: number; label: string }

export default function SchoolMap({ schools, onSelect, origin, onOrigin }: { schools: School[]; onSelect: (id: string) => void; origin: MapOrigin | null; onOrigin: (o: MapOrigin | null) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const originRef = useRef<L.Marker | null>(null)
  const [tileFailed, setTileFailed] = useState(false)
  const [boundary, setBoundary] = useState<'loading' | 'loaded' | 'none'>('loading')

  useEffect(() => {
    if (!el.current || mapRef.current) return
    const map = L.map(el.current, { center: [37.5665, 126.978], zoom: 11, zoomControl: true, attributionControl: true })
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' })
    tiles.on('tileerror', () => setTileFailed(true))
    tiles.addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    // 서울 행정경계는 공식 자료(public/geo/seoul-districts.geojson)를 등록했을 때만 표시한다. 없으면 점만.
    fetch('/geo/seoul-districts.geojson')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('none'))))
      .then((gj) => {
        L.geoJSON(gj as GeoJSON.GeoJsonObject, { style: { color: '#244E48', weight: 1, fillOpacity: 0.03 } }).addTo(map)
        setBoundary('loaded')
      })
      .catch(() => setBoundary('none'))
    map.on('click', (e: L.LeafletMouseEvent) => {
      onOrigin({ lat: Number(e.latlng.lat.toFixed(4)), lng: Number(e.latlng.lng.toFixed(4)), label: '지도에서 찍은 대략적 위치' })
    })
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.clearLayers()
    const pts: L.LatLngExpression[] = []
    for (const s of schools) {
      if (!s.geo) continue
      pts.push([s.geo.lat, s.geo.lng])
      const m = L.circleMarker([s.geo.lat, s.geo.lng], { radius: 7, color: '#244E48', weight: 1.5, fillColor: s.isSynthetic ? '#B48A4D' : '#244E48', fillOpacity: 0.85 })
      const dist = origin ? formatStraightLine(haversineKm(origin, s.geo)) : null
      m.bindTooltip(`${s.officialName}${dist ? ` · ${dist}` : ''}`, { direction: 'top' })
      m.on('click', () => onSelect(s.id))
      m.addTo(layer)
    }
    if (pts.length > 0 && mapRef.current && !origin) mapRef.current.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 13 })
  }, [schools, onSelect, origin])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (originRef.current) {
      originRef.current.remove()
      originRef.current = null
    }
    if (origin) {
      originRef.current = L.marker([origin.lat, origin.lng], { icon: L.divIcon({ className: '', html: '<div style="width:14px;height:14px;border-radius:50%;background:#B48A4D;border:2px solid #fff;box-shadow:0 0 0 2px #B48A4D"></div>', iconSize: [14, 14] }) })
        .bindTooltip(origin.label)
        .addTo(map)
    }
  }, [origin])

  return (
    <div className="map-box" role="region" aria-label="학교 위치 지도">
      <div ref={el} style={{ height: '100%' }} />
      <div className="map-note">
        {tileFailed ? '배경 지도를 불러오지 못해 학교 점만 표시합니다. ' : ''}
        {boundary === 'none' ? '행정경계 자료 미등록 (점만 표시). ' : ''}
        지도를 클릭하면 대략적 출발 위치를 찍고 직선거리를 봅니다. 직선거리는 통학 시간이 아닙니다.
      </div>
    </div>
  )
}
