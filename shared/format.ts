/** 표시 규약 — 저장은 ISO, 표시는 Asia/Seoul. 시각이 없으면 임의 시각을 만들지 않는다. */
export function formatDateKo(iso: string | null | undefined, opts: { withTime?: boolean } = {}): string {
  if (!iso) return '미확인'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(d)
  if (!opts.withTime) return date
  const time = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date} ${time}`
}

export function formatCalendarDate(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ymd
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`
}

export function formatCredit(value: number | null, unit: 'credit' | 'unit' | 'hours' | 'unknown'): string {
  if (value === null) return '학점 미확인'
  const u = unit === 'unit' ? '단위' : unit === 'hours' ? '시간' : unit === 'credit' ? '학점' : ''
  return `${value}${u}`
}

export function pluralKo(n: number, noun: string): string {
  return `${n.toLocaleString('ko-KR')}${noun}`
}
