/**
 * 지도 마커 범례: 학교 유형(세부 구분 포함)별 색·모양. 색만으로 구분하지 않도록 모양도 다르게 둔다.
 * 유형은 학교알리미 값을 따르고(2026-10-17 결정), 특수목적고는 NEIS 세부 구분으로 나눈다.
 */
import { schoolSubtypeLabel, type School } from '@shared/types'

export type MarkerKey = 'general' | 'autonomous_public' | 'autonomous_private' | 'foreign_intl' | 'science' | 'arts_sports' | 'meister' | 'special_other' | 'specialized' | 'other' | 'unknown'
export type MarkerShape = 'circle' | 'square' | 'diamond' | 'triangle' | 'triangle_down' | 'hexagon' | 'star' | 'ring'

export interface MarkerStyle { key: MarkerKey; label: string; color: string; shape: MarkerShape }

export const MARKER_STYLES: MarkerStyle[] = [
  { key: 'general', label: '일반고', color: '#244E48', shape: 'circle' },
  { key: 'autonomous_public', label: '자율형 공립고', color: '#2F6FB5', shape: 'square' },
  { key: 'autonomous_private', label: '자율형 사립고', color: '#7B4FA6', shape: 'diamond' },
  { key: 'foreign_intl', label: '외국어고 · 국제고', color: '#C0392B', shape: 'triangle' },
  { key: 'science', label: '과학고', color: '#1B8A6B', shape: 'star' },
  { key: 'arts_sports', label: '예술고 · 체육고', color: '#D9731A', shape: 'triangle_down' },
  { key: 'meister', label: '마이스터고', color: '#8A6D1B', shape: 'hexagon' },
  { key: 'special_other', label: '특수목적고 (기타)', color: '#B03A6E', shape: 'triangle' },
  { key: 'specialized', label: '특성화고', color: '#B48A4D', shape: 'hexagon' },
  { key: 'other', label: '기타·각종학교', color: '#6B7280', shape: 'square' },
  { key: 'unknown', label: '유형 미확인', color: '#9CA3AF', shape: 'ring' },
]

const BY_KEY = new Map(MARKER_STYLES.map((m) => [m.key, m]))

export function markerKey(s: Pick<School, 'schoolType' | 'schoolSubtype'>): MarkerKey {
  if (s.schoolType === 'special_purpose') {
    const sub = schoolSubtypeLabel(s.schoolSubtype)
    if (sub === '외국어고' || sub === '국제고') return 'foreign_intl'
    if (sub === '과학고') return 'science'
    if (sub === '예술고' || sub === '체육고') return 'arts_sports'
    if (sub === '마이스터고') return 'meister'
    return 'special_other'
  }
  if (s.schoolType === 'general' || s.schoolType === 'autonomous_public' || s.schoolType === 'autonomous_private' || s.schoolType === 'specialized' || s.schoolType === 'other') return s.schoolType
  return 'unknown'
}

export function markerStyle(s: Pick<School, 'schoolType' | 'schoolSubtype'>): MarkerStyle {
  return BY_KEY.get(markerKey(s)) ?? MARKER_STYLES[MARKER_STYLES.length - 1]!
}

/** 모양을 SVG 로 그린다. size 는 px, 선택 시 테두리를 강조한다. */
export function markerSvg(st: MarkerStyle, size: number, selected = false): string {
  const c = size / 2
  const r = c - 1.5
  const stroke = selected ? '#1F1A14' : '#ffffff'
  const sw = selected ? 2.5 : 1.4
  const common = `fill="${st.color}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"`
  const pts = (n: number, rot: number, radius = r) => Array.from({ length: n }, (_, i) => { const a = rot + (i * 2 * Math.PI) / n; return `${(c + radius * Math.cos(a)).toFixed(2)},${(c + radius * Math.sin(a)).toFixed(2)}` }).join(' ')
  let body: string
  switch (st.shape) {
    case 'circle': body = `<circle cx="${c}" cy="${c}" r="${r}" ${common}/>`; break
    case 'ring': body = `<circle cx="${c}" cy="${c}" r="${r - 1}" fill="#ffffff" stroke="${st.color}" stroke-width="${sw + 1}"/>`; break
    case 'square': body = `<rect x="${c - r * 0.82}" y="${c - r * 0.82}" width="${r * 1.64}" height="${r * 1.64}" rx="1.5" ${common}/>`; break
    case 'diamond': body = `<polygon points="${pts(4, -Math.PI / 2, r)}" ${common}/>`; break
    case 'triangle': body = `<polygon points="${pts(3, -Math.PI / 2, r)}" ${common}/>`; break
    case 'triangle_down': body = `<polygon points="${pts(3, Math.PI / 2, r)}" ${common}/>`; break
    case 'hexagon': body = `<polygon points="${pts(6, 0, r)}" ${common}/>`; break
    case 'star': {
      const p: string[] = []
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rad = i % 2 === 0 ? r : r * 0.45; p.push(`${(c + rad * Math.cos(a)).toFixed(2)},${(c + rad * Math.sin(a)).toFixed(2)}`) }
      body = `<polygon points="${p.join(' ')}" ${common}/>`
      break
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${body}</svg>`
}
