/**
 * 선택군 규칙 엔진 — ACCEPTANCE_SCENARIOS 01~09 재현.
 * 기대값은 시나리오 문서를 보고 사람이 작성했다 (추출/엔진 코드로 만들지 않음).
 */
import { describe, expect, it } from 'vitest'
import { validatePlan, canSelectTogether } from '../../shared/engine/selection'
import { summarizeCredits } from '../../shared/engine/credits'
import { resolveCurriculum } from '../../shared/engine/cohort'
import { SYN, SYNTHETIC_DATASET, syntheticBundle } from '../../fixtures/synthetic'

const A27 = () => syntheticBundle(SYN.A27)
const B27 = () => syntheticBundle(SYN.B27)

describe('01 같은 선택군에서 하나만 선택 (A교 G: 3택1)', () => {
  it('A+B 를 함께 선택하면 확인된 규칙과 충돌하고 G 와 근거를 가리킨다', () => {
    const r = validatePlan({ bundle: A27(), selectedOfferingIds: ['off_a27_A', 'off_a27_B'], targetCohortYear: 2027 })
    expect(r.verdict).toBe('conflicts_with_verified_rules')
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]!.groupLabel).toBe('선택군 G')
    expect(r.violations[0]!.limit).toBe(1)
    expect(r.violations[0]!.actual).toBe(2)
    expect(r.violations[0]!.evidenceIds).toContain('ev_a27_t2_G')
    // 근거 안의 다른 조합 제시
    expect(r.alternatives.map((a) => a.offeringIds)).toEqual(expect.arrayContaining([['off_a27_A'], ['off_a27_B']]))
  })
  it('A 만 선택하면 이 규칙 범위에서 충돌 없음, 개설 보장은 아님', () => {
    const r = validatePlan({ bundle: A27(), selectedOfferingIds: ['off_a27_A'], targetCohortYear: 2027 })
    expect(r.verdict).toBe('no_conflict_within_verified_rules')
    expect(r.disclaimer).toMatch(/보장하지 않습니다/)
  })
  it('후보 과목 전체 9학점을 학생 이수 학점으로 더하지 않는다', () => {
    const r = validatePlan({ bundle: A27(), selectedOfferingIds: ['off_a27_A'], targetCohortYear: 2027 })
    expect(r.credits.selectedConfirmed).toBe(3)
  })
})

describe('02 두 과목 선택 (B교 G: 최대 2과목)', () => {
  it('A+B 허용', () => {
    const r = validatePlan({ bundle: B27(), selectedOfferingIds: ['off_b27_A', 'off_b27_B'], targetCohortYear: 2027 })
    expect(r.verdict).toBe('no_conflict_within_verified_rules')
  })
  it("각주 '최대 2과목' 을 최소 2개 필수로 해석하지 않는다: A 만 선택해도 충돌 아님", () => {
    const r = validatePlan({ bundle: B27(), selectedOfferingIds: ['off_b27_A'], targetCohortYear: 2027 })
    expect(r.verdict).toBe('no_conflict_within_verified_rules')
  })
  it('3과목 모두 선택하면 충돌', () => {
    const r = validatePlan({ bundle: B27(), selectedOfferingIds: ['off_b27_A', 'off_b27_B', 'off_b27_C'], targetCohortYear: 2027 })
    expect(r.verdict).toBe('conflicts_with_verified_rules')
  })
})

describe('03 규칙 미상 (B교 M/O: 같은 학기 나열, 선택군 없음)', () => {
  it('가능하다고 확정하지 않고, 같은 학기라는 이유로 충돌이라고도 하지 않는다', () => {
    const r = validatePlan({ bundle: B27(), selectedOfferingIds: ['off_b27_M', 'off_b27_O'], targetCohortYear: 2027 })
    expect(r.verdict).toBe('insufficient_data')
    expect(r.violations).toHaveLength(0)
    expect(r.unknowns[0]!.reason).toBe('no_group')
    expect(r.unknowns[0]!.question).toMatch(/문의/)
  })
})

describe('04 입학연도 불일치', () => {
  it('2027 상담에 2026 편제표만 있으면 참고 전용이고 경로 검증에 쓰지 않는다', () => {
    const r = validatePlan({ bundle: syntheticBundle(SYN.A26), selectedOfferingIds: ['off_a26_A', 'off_a26_B'], targetCohortYear: 2027 })
    expect(r.verdict).toBe('insufficient_data')
    expect(r.unknowns[0]!.reason).toBe('cohort_mismatch')
    expect(r.violations).toHaveLength(0)
  })
  it('resolveCurriculum 은 2027 요청에 2026 자료를 자동 대체하지 않는다', () => {
    const ds = SYNTHETIC_DATASET
    const lookup = resolveCurriculum({
      schoolId: SYN.C,
      cohortYear: 2027,
      trackId: null,
      versions: ds.versions.filter((v) => v.schoolId === SYN.C),
      tracks: ds.tracks.filter((t) => t.schoolId === SYN.C),
      loadBundle: (id) => syntheticBundle(id),
    })
    expect(lookup.status).toBe('cohort_not_available')
    expect(lookup.bundle).toBeNull()
    expect(lookup.referenceOnly.map((r) => r.cohortYear)).toEqual([2026, 2026])
  })
})

describe('05 학과·과정 불일치', () => {
  it('학교명만으로 두 학과를 합치지 않고 과정 선택을 요구한다', () => {
    const ds = SYNTHETIC_DATASET
    const lookup = resolveCurriculum({
      schoolId: SYN.C,
      cohortYear: 2026,
      trackId: null,
      versions: ds.versions.filter((v) => v.schoolId === SYN.C),
      tracks: ds.tracks.filter((t) => t.schoolId === SYN.C),
      loadBundle: (id) => syntheticBundle(id),
    })
    expect(lookup.status).toBe('track_required')
    expect(lookup.availableTracks.map((t) => t.name).sort()).toEqual(['디자인과', '정보보안과'])
  })
  it('과정을 지정하면 그 과정 편제만 돌려준다', () => {
    const ds = SYNTHETIC_DATASET
    const lookup = resolveCurriculum({
      schoolId: SYN.C,
      cohortYear: 2026,
      trackId: 'trk_syn_c_des',
      versions: ds.versions.filter((v) => v.schoolId === SYN.C),
      tracks: ds.tracks.filter((t) => t.schoolId === SYN.C),
      loadBundle: (id) => syntheticBundle(id),
    })
    expect(lookup.status).toBe('available')
    expect(lookup.bundle!.offerings.every((o) => o.trackId === 'trk_syn_c_des')).toBe(true)
  })
})

describe('06 연간 선택 제한 (A교 H: 2학년 전체 1과목)', () => {
  it('학기가 달라도 D+E 는 충돌이며 기간 범위를 보여준다', () => {
    const r = validatePlan({ bundle: A27(), selectedOfferingIds: ['off_a27_D', 'off_a27_E'], targetCohortYear: 2027 })
    expect(r.verdict).toBe('conflicts_with_verified_rules')
    expect(r.violations[0]!.periodScope).toBe('grade_year')
    expect(r.violations[0]!.periodRange).toBe('2학년 전체')
  })
})

describe('07 교차 편성 (A교 F: 1·2학기 표시, 한 번 이수)', () => {
  it('두 학기 표시를 6학점 이수로 합산하지 않는다', () => {
    const r = validatePlan({ bundle: A27(), selectedOfferingIds: ['off_a27_F1', 'off_a27_F2'], targetCohortYear: 2027 })
    expect(r.verdict).toBe('no_conflict_within_verified_rules')
    expect(r.credits.selectedConfirmed).toBe(3)
  })
  it('F 와 G 를 같이 고르면 선택군 X 의 1과목 제한과 충돌', () => {
    const r = validatePlan({ bundle: A27(), selectedOfferingIds: ['off_a27_F1', 'off_a27_G2'], targetCohortYear: 2027 })
    expect(r.verdict).toBe('conflicts_with_verified_rules')
  })
})

describe('08 학점 누락 (A교 과목 N: null)', () => {
  it("총합 0 으로 더하지 않고 '확인된 합계 + 미확인 1개' 로 표현, 졸업 판정 보류", () => {
    const c = summarizeCredits(A27(), [])
    // 지정: 공통국어1,2(8) 공통수학1,2(8) 공통영어1,2(8) 정보(3) 문학(4) 대수(4) = 35, 과목 N 미확인
    expect(c.designatedConfirmed).toBe(35)
    expect(c.designatedUnknownCount).toBe(1)
    expect(c.graduationJudgement).toBe('not_evaluated')
    expect(c.note).toMatch(/미확인 과목 1개/)
  })
})

describe('09 복수 자료 충돌 (A교 K: 편제표 1과목 vs 안내서 2과목)', () => {
  it('최신 수집일로 덮어쓰지 않고 충돌 상태를 유지해 판단을 보류한다', () => {
    const r = canSelectTogether(A27(), 'off_a27_P', 'off_a27_Q', 2027)
    expect(r.verdict).toBe('insufficient_data')
    expect(r.unknowns[0]!.reason).toBe('rule_conflict')
    expect(r.violations).toHaveLength(0)
  })
})

describe('기타 불변 조건', () => {
  it('같은 학기라도 서로 다른 선택군이면 충돌이 아니다', () => {
    const r = validatePlan({ bundle: A27(), selectedOfferingIds: ['off_a27_A', 'off_a27_D'], targetCohortYear: 2027 })
    expect(r.verdict).toBe('no_conflict_within_verified_rules')
  })
  it('학점 한도가 있는 선택군에서 학점이 미확인이면 보류', () => {
    const bundle = A27()
    const f = bundle.offerings.find((o) => o.id === 'off_a27_F1')!
    f.creditValue = null
    const r = validatePlan({ bundle, selectedOfferingIds: ['off_a27_F1'], targetCohortYear: 2027 })
    expect(r.verdict).toBe('insufficient_data')
    expect(r.unknowns[0]!.reason).toBe('credit_missing')
  })
  it('2015 단위와 2022 학점이 섞이면 mixedUnits 경고', () => {
    const bundle = A27()
    bundle.offerings[0]!.creditUnit = 'unit'
    const c = summarizeCredits(bundle, [])
    expect(c.mixedUnits).toBe(true)
  })
})
