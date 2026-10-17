import { describe, expect, it } from 'vitest'
import { parseQuery } from '../../shared/search/query'
import { matchesName, toChosung } from '../../shared/search/hangul'
import { haversineKm, formatStraightLine } from '../../shared/geo'
import { csvSafeCell, normalizeGender, normalizeSchoolType, districtFromAddress } from '../../shared/normalize'
import { DISTRICT_NAMES, SEOUL_DISTRICTS } from '../../shared/constants'

describe('검색 문장 해석', () => {
  it('동대문구에서 정보 관련 과목이 확인된 학교 → 자치구·과목·확인 조건 칩', () => {
    const p = parseQuery('동대문구에서 정보 관련 과목이 확인된 학교')
    expect(p.district).toEqual(['동대문구'])
    expect(p.courseKeyword).toEqual(['정보'])
    expect(p.requireConfirmedCourse).toBe(true)
    expect(p.text).toBe('')
  })
  it('이해하지 못한 조건은 일반 검색어로 남긴다', () => {
    const p = parseQuery('성북구 여고 급식 맛있는')
    expect(p.district).toEqual(['성북구'])
    expect(p.gender).toEqual(['girls'])
    expect(p.text).toContain('급식')
    expect(p.unrecognized.length).toBe(1)
  })
  it('유형과 프로그램을 혼동하지 않는다 (일반고 + 과학중점)', () => {
    const p = parseQuery('일반고 과학중점')
    expect(p.schoolType).toEqual(['general'])
    expect(p.programKeyword).toEqual(['과학중점'])
  })
})

describe('초성 검색', () => {
  it('초성 분해', () => {
    expect(toChosung('가상학교')).toBe('ㄱㅅㅎㄱ')
  })
  it('초성과 공백 변형으로 이름 매칭', () => {
    expect(matchesName('ㄱㅅ ㅎㄱ', ['가상 학교 A'])).toBe(true)
    expect(matchesName('가상학교', ['가상 학교 A'])).toBe(true)
    expect(matchesName('진짜', ['가상 학교 A'])).toBe(false)
  })
})

describe('지리', () => {
  it('직선거리는 직선거리로만 표시한다', () => {
    const km = haversineKm({ lat: 37.5744, lng: 127.0396 }, { lat: 37.6066, lng: 127.0232 })
    expect(km).toBeGreaterThan(3.5)
    expect(km).toBeLessThan(4.2)
    expect(formatStraightLine(km)).toMatch(/^직선 \d\.\d km$/)
  })
  it('25개 자치구 코드는 서로 다르다', () => {
    expect(DISTRICT_NAMES).toHaveLength(25)
    expect(new Set(SEOUL_DISTRICTS.map((d) => d.legalCode)).size).toBe(25)
  })
})

describe('정규화', () => {
  it('모르면 unknown', () => {
    expect(normalizeSchoolType('')).toBe('unknown')
    expect(normalizeSchoolType('자율형 사립고등학교')).toBe('autonomous_private')
    expect(normalizeGender('혼합')).toBe('unknown')
    expect(normalizeGender('남녀공학')).toBe('coed')
    expect(districtFromAddress('서울특별시 강남구 역삼동', DISTRICT_NAMES)).toBe('강남구')
    expect(districtFromAddress('서울특별시', DISTRICT_NAMES)).toBeNull()
  })
  it('CSV 수식 삽입 방어', () => {
    expect(csvSafeCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvSafeCell('+1')).toBe("'+1")
    expect(csvSafeCell('가상 학교, A')).toBe('"가상 학교, A"')
  })
})
