/** 한글 초성 검색·공백 변형. 동명이교는 id 로 구분하고 이름만으로 합치지 않는다. */
const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']

export function toChosung(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.charCodeAt(0)
    if (code >= 0xac00 && code <= 0xd7a3) out += CHO[Math.floor((code - 0xac00) / 588)]
    else out += ch
  }
  return out
}

export function isChosungQuery(q: string): boolean {
  const compact = q.replace(/\s+/g, '')
  return compact.length > 0 && [...compact].every((c) => CHO.includes(c))
}

export function normalizeForSearch(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

/** 이름·별칭 중 하나라도 질의와 맞는지. */
export function matchesName(query: string, names: string[]): boolean {
  const q = normalizeForSearch(query)
  if (!q) return true
  if (isChosungQuery(q)) return names.some((n) => toChosung(normalizeForSearch(n)).includes(q))
  return names.some((n) => normalizeForSearch(n).includes(q))
}
