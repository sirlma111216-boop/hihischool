/**
 * 검색 문장 → 조건 칩. 규칙 기반이며 AI 를 쓰지 않는다.
 * 예: "동대문구에서 정보 관련 과목이 확인된 학교"
 *   → district=동대문구, courseKeyword=정보, requireConfirmed=true, residual=""
 * 이해하지 못한 조건은 residual 텍스트로 남겨 일반 검색에 쓴다.
 */
import { DISTRICT_NAMES } from '../constants'
import type { SchoolType, Gender, Establishment } from '../types'

export interface ParsedQuery {
  text: string // 남은 일반 검색어
  district: string[]
  schoolType: SchoolType[]
  gender: Gender[]
  establishment: Establishment[]
  courseKeyword: string[]
  programKeyword: string[]
  requireConfirmedCourse: boolean
  chips: { key: string; label: string; value: string }[]
  unrecognized: string[]
}

const TYPE_WORDS: [RegExp, SchoolType][] = [
  [/자율형\s*사립고|자사고/, 'autonomous_private'],
  [/자율형\s*공립고|자공고/, 'autonomous_public'],
  [/특수목적고|특목고/, 'special_purpose'],
  [/특성화고/, 'specialized'],
  [/일반고/, 'general'],
]
const GENDER_WORDS: [RegExp, Gender][] = [
  [/남녀공학|공학/, 'coed'],
  [/여고|여자고/, 'girls'],
  [/남고|남자고/, 'boys'],
]
const EST_WORDS: [RegExp, Establishment][] = [
  [/국립/, 'national'],
  [/공립/, 'public'],
  [/사립/, 'private'],
]
const PROGRAM_WORDS = ['과학중점', '예술중점', '체육중점', '외국어', '국제', '영재', 'SW', '소프트웨어', 'AI', '인공지능', '디자인', '마이스터']

export function parseQuery(raw: string): ParsedQuery {
  let text = raw.trim()
  const out: ParsedQuery = {
    text: '',
    district: [],
    schoolType: [],
    gender: [],
    establishment: [],
    courseKeyword: [],
    programKeyword: [],
    requireConfirmedCourse: false,
    chips: [],
    unrecognized: [],
  }
  if (!text) return out

  for (const d of DISTRICT_NAMES) {
    const re = new RegExp(`${d}(?:에서|의|에|\\s)?`)
    if (re.test(text)) {
      out.district.push(d)
      out.chips.push({ key: 'district', label: `자치구: ${d}`, value: d })
      text = text.replace(re, ' ')
    }
  }
  for (const [re, t] of TYPE_WORDS) {
    if (re.test(text)) {
      out.schoolType.push(t)
      out.chips.push({ key: 'schoolType', label: `유형: ${re.source.split('|')[0]!.replace(/\\s\*/g, '')}`, value: t })
      text = text.replace(re, ' ')
    }
  }
  for (const [re, g] of GENDER_WORDS) {
    if (re.test(text)) {
      out.gender.push(g)
      out.chips.push({ key: 'gender', label: `공학구분: ${g === 'coed' ? '남녀공학' : g === 'girls' ? '여고' : '남고'}`, value: g })
      text = text.replace(re, ' ')
    }
  }
  for (const [re, e] of EST_WORDS) {
    if (re.test(text)) {
      out.establishment.push(e)
      out.chips.push({ key: 'establishment', label: `설립: ${e === 'public' ? '공립' : e === 'private' ? '사립' : '국립'}`, value: e })
      text = text.replace(re, ' ')
    }
  }
  for (const p of PROGRAM_WORDS) {
    if (text.includes(p)) {
      out.programKeyword.push(p)
      out.chips.push({ key: 'program', label: `검토된 프로그램: ${p}`, value: p })
      text = text.replace(p, ' ')
    }
  }
  // "X 관련 과목", "X 과목", "X 과목이 확인된"
  const courseRe = /([가-힣A-Za-z0-9·]+?)\s*(?:관련\s*)?과목(?:이|을|가)?\s*(확인된|개설된|있는|편성된)?/
  const m = text.match(courseRe)
  if (m && m[1]) {
    out.courseKeyword.push(m[1])
    out.chips.push({ key: 'course', label: `과목: ${m[1]}`, value: m[1] })
    if (m[2] === '확인된' || m[2] === '개설된' || m[2] === '편성된') {
      out.requireConfirmedCourse = true
      out.chips.push({ key: 'confirmed', label: '편성 확인된 결과만', value: 'true' })
    }
    text = text.replace(m[0], ' ')
  }
  text = text.replace(/(^|\s)(학교|고등학교|고교|찾기|검색|목록|보여줘|알려줘)(?=\s|$)/g, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  // 조사만 남은 토큰 제거
  const tokens = text.split(' ').filter((t) => t && !/^(에서|의|이|가|을|를|중|있는|확인된|관련)$/.test(t))
  out.text = tokens.join(' ')
  if (out.text && out.chips.length > 0) out.unrecognized.push(out.text)
  return out
}
