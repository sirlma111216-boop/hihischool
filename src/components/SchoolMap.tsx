/**
 * Leaflet 지도. 타일은 OpenStreetMap (이용 정책·표시 준수, 오프라인 대량 저장 없음).
 * 타일 실패 시 학교 점·행정경계(있으면)만으로 기능을 유지한다. 유료 키 불필요.
 * 마커는 학교 유형별 색+모양(범례)으로 구분하고, 지도 안에서 이름 검색·자치구·유형으로 바로 거를 수 있다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { School } from '@shared/types'
import { DISTRICT_NAMES } from '@shared/constants'
import { haversineKm, formatStraightLine } from '@shared/geo'
import { MARKER_STYLES, markerKey, markerStyle, markerSvg, type MarkerKey } from '../lib/mapstyle'

export interface MapOrigin { lat: number; lng: number; label: string }

const MARKER_PX = 18
const MARKER_SEL_PX = 28

function matchName(q: string, s: School): boolean {
  const n = q.replace(/\s+/g, '').toLowerCase()
  if (!n) return true
  const hay = [s.officialName, s.shortName ?? '', ...s.aliases, s.district, s.address ?? ''].join('|').replace(/\s+/g, '').toLowerCase()
  return hay.includes(n)
}

export default function SchoolMap({ schools, onSelect, origin, onOrigin, selectedId = null }: { schools: School[]; onSelect: (id: string) => void; origin: MapOrigin | null; onOrigin: (o: MapOrigin | null) => void; selectedId?: string | null }) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const originRef = useRef<L.Marker | null>(null)
  const [tileFailed, setTileFailed] = useState(false)
  const [boundary, setBoundary] = useState<'loading' | 'loaded' | 'none'>('loading')
  // 지도 안 즉시 필터 (URL·서버 조건과 별개로, 현재 결과 안에서만 거른다)
  const [nameQ, setNameQ] = useState('')
  const [district, setDistrict] = useState('')
  const [hidden, setHidden] = useState<Set<MarkerKey>>(new Set())
  const [legendOpen, setLegendOpen] = useState(true)

  const counts = useMemo(() => {
    const c = new Map<MarkerKey, number>()
    for (const s of schools) c.set(markerKey(s), (c.get(markerKey(s)) ?? 0) + 1)
    return c
  }, [schools])

  const visible = useMemo(
    () => schools.filter((s) => !hidden.has(markerKey(s)) && (!district || s.district === district) && matchName(nameQ, s)),
    [schools, hidden, district, nameQ],
  )
  const noGeo = visible.filter((s) => !s.geo).length
  const filtered = Boolean(nameQ || district || hidden.size > 0)

  useEffect(() => {
    if (!el.current || mapRef.current) return
    // 서울 범위 밖으로 나가거나 더 멀리 보지 않도록 경계·최소 확대 수준을 고정한다 (약간의 여유 포함)
    const seoulBounds = L.latLngBounds([37.41, 126.74], [37.72, 127.20])
    const map = L.map(el.current, { center: [37.5665, 126.978], zoom: 11, minZoom: 10, maxZoom: 18, zoomSnap: 0.25, zoomDelta: 0.5, maxBounds: seoulBounds, maxBoundsViscosity: 1.0, zoomControl: true, attributionControl: true })
    // 화면이 넓어도 서울 밖(경기도)이 크게 보이지 않도록, 서울 경계가 화면에 꼭 맞는 확대 수준을 하한으로 둔다 (크기 바뀌면 다시 계산)
    const applyMinZoom = () => {
      const z = Math.max(10, map.getBoundsZoom(seoulBounds, false) + 0.25)
      map.setMinZoom(z)
      if (map.getZoom() < z) map.setZoom(z)
    }
    map.whenReady(() => { applyMinZoom(); map.fitBounds(seoulBounds) })
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
    // 컨테이너 크기가 바뀌면(큰 화면·패널 접기) 타일을 다시 맞춘다
    const ro = new ResizeObserver(() => { map.invalidateSize(); applyMinZoom() })
    ro.observe(el.current)
    return () => {
      ro.disconnect()
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
    for (const s of visible) {
      if (!s.geo) continue
      pts.push([s.geo.lat, s.geo.lng])
      const sel = s.id === selectedId
      const st = markerStyle(s)
      const px = sel ? MARKER_SEL_PX : MARKER_PX
      const m = L.marker([s.geo.lat, s.geo.lng], {
        icon: L.divIcon({ className: `school-marker${sel ? ' selected' : ''}${s.isSynthetic ? ' synthetic' : ''}`, html: markerSvg(st, px, sel), iconSize: [px, px], iconAnchor: [px / 2, px / 2] }),
        zIndexOffset: sel ? 1000 : 0,
        keyboard: true,
        title: s.officialName,
      })
      const dist = origin ? formatStraightLine(haversineKm(origin, s.geo)) : null
      m.bindTooltip(`${s.officialName} · ${st.label}${dist ? ` · ${dist}` : ''}`, { direction: 'top', offset: [0, -px / 2] })
      m.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e) // 지도 클릭(출발 위치 찍기)과 구분
        onSelect(s.id)
      })
      m.addTo(layer)
    }
    if (pts.length > 0 && mapRef.current && !origin && !selectedId && filtered) mapRef.current.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 14 }) // 전체 결과일 땐 서울 경계 그대로
  }, [visible, onSelect, origin, selectedId, filtered])

  // 선택한 학교가 화면 밖이면 보이게 옮긴다 (확대 수준은 유지)
  useEffect(() => {
    const map = mapRef.current
    const s = schools.find((x) => x.id === selectedId)
    if (!map || !s?.geo) return
    const ll = L.latLng(s.geo.lat, s.geo.lng)
    if (!map.getBounds().pad(-0.1).contains(ll)) map.panTo(ll)
  }, [selectedId, schools])

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

  const toggleKey = (k: MarkerKey) => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const onlyKey = (k: MarkerKey) => setHidden(new Set(MARKER_STYLES.map((m) => m.key).filter((x) => x !== k)))
  const presentKeys = MARKER_STYLES.filter((m) => (counts.get(m.key) ?? 0) > 0)

  return (
    <div className="map-wrap">
      <div className="map-tools" role="search" aria-label="지도 안 검색·필터">
        <input className="input" value={nameQ} onChange={(e) => setNameQ(e.target.value)} placeholder="지도에서 학교 이름·주소로 바로 찾기" aria-label="지도에서 학교 이름으로 찾기" />
        <select className="select" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="자치구로 거르기">
          <option value="">자치구 전체</option>
          {DISTRICT_NAMES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <span className="small muted">표시 {visible.length - noGeo}교{noGeo ? ` · 좌표 없음 ${noGeo}교` : ''} / 결과 {schools.length}교</span>
        {filtered && <button type="button" className="btn quiet sm" onClick={() => { setNameQ(''); setDistrict(''); setHidden(new Set()) }}>지도 필터 지우기</button>}
      </div>
      <div className="map-box" role="region" aria-label="학교 위치 지도">
        <div ref={el} style={{ height: '100%' }} />
        <div className={`map-legend${legendOpen ? '' : ' collapsed'}`} aria-label="범례 (학교 유형)">
          <button type="button" className="map-legend-head" aria-expanded={legendOpen} onClick={() => setLegendOpen((o) => !o)}>
            <span>범례 · 학교 유형</span><span aria-hidden="true">{legendOpen ? '−' : '+'}</span>
          </button>
          {legendOpen && (
            <ul>
              {presentKeys.map((m) => {
                const off = hidden.has(m.key)
                return (
                  <li key={m.key} className={off ? 'off' : ''}>
                    <button type="button" aria-pressed={!off} onClick={() => toggleKey(m.key)} title={off ? '다시 표시' : '숨기기'}>
                      <span className="sw" dangerouslySetInnerHTML={{ __html: markerSvg(m, 16) }} />
                      <span className="lb">{m.label}</span>
                      <span className="ct">{counts.get(m.key)}</span>
                    </button>
                    <button type="button" className="only" onClick={() => onlyKey(m.key)} aria-label={`${m.label}만 표시`}>만</button>
                  </li>
                )
              })}
              <li className="bulk">
                <button type="button" className="all" disabled={hidden.size === 0} onClick={() => setHidden(new Set())}>모두 선택</button>
                <button type="button" className="all" disabled={hidden.size >= presentKeys.length} onClick={() => setHidden(new Set(presentKeys.map((m) => m.key)))}>모두 해제</button>
              </li>
            </ul>
          )}
        </div>
        <div className="map-note">
          {tileFailed ? '배경 지도를 불러오지 못해 학교 점만 표시합니다. ' : ''}
          {boundary === 'none' ? '' : boundary === 'loaded' ? '행정경계 표시. ' : ''}
          유형은 학교알리미 공시 기준, 세부 구분은 나이스 기준입니다. 지도를 클릭하면 출발 위치를 찍고 직선거리를 봅니다 (통학 시간 아님).
        </div>
      </div>
    </div>
  )
}
