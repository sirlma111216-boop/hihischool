/**
 * 외부 제공처 값 → 내부 enum 정규화. 모르면 'unknown' 으로 두고 추측하지 않는다.
 */
import type { Establishment, Gender, SchoolType, DayNight } from './types'

export function normalizeSchoolType(raw: string | null | undefined): SchoolType {
  const s = (raw ?? '').replace(/\s+/g, '')
  if (!s) return 'unknown'
  if (/자율형사립|자사고/.test(s)) return 'autonomous_private'
  if (/자율형공립|자공고/.test(s)) return 'autonomous_public'
  if (/특수목적|특목/.test(s)) return 'special_purpose'
  if (/특성화/.test(s)) return 'specialized'
  if (/일반/.test(s)) return 'general'
  if (/각종|기타/.test(s)) return 'other'
  return 'unknown'
}

export function normalizeEstablishment(raw: string | null | undefined): Establishment {
  const s = (raw ?? '').trim()
  if (s.includes('국립')) return 'national'
  if (s.includes('공립')) return 'public'
  if (s.includes('사립')) return 'private'
  return 'unknown'
}

export function normalizeGender(raw: string | null | undefined): Gender {
  const s = (raw ?? '').replace(/\s+/g, '')
  if (!s) return 'unknown'
  if (/남녀공학|공학/.test(s)) return 'coed'
  if (/^남$|남자|남학교|남고/.test(s)) return 'boys'
  if (/^여$|^녀$|여자|여학교|여고/.test(s)) return 'girls' // 학교알리미 COEDU_SC_CODE 는 '남' / '녀' / '남녀공학'
  return 'unknown'
}

export function normalizeDayNight(raw: string | null | undefined): DayNight {
  const s = (raw ?? '').replace(/\s+/g, '')
  if (!s) return 'unknown'
  if (/주야|주간\/야간|주·야/.test(s)) return 'both'
  if (/야간/.test(s)) return 'night'
  if (/주간/.test(s)) return 'day'
  return 'unknown'
}

/** 주소에서 자치구 추출. 없으면 null (추측 금지). */
export function districtFromAddress(address: string | null | undefined, districts: string[]): string | null {
  if (!address) return null
  for (const d of districts) if (address.includes(d)) return d
  return null
}

export function slugId(prefix: string, ...parts: (string | number | null | undefined)[]): string {
  const body = parts
    .filter((p) => p !== null && p !== undefined && `${p}`.length > 0)
    .map((p) => `${p}`.replace(/[^0-9A-Za-z가-힣]+/g, '-').replace(/^-|-$/g, ''))
    .join('-')
  return `${prefix}_${body}`
}

/** CSV 수식 삽입 방어: =, +, -, @, 탭, CR 로 시작하면 작은따옴표를 앞에 붙인다. */
export function csvSafeCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}
