/**
 * 연속 편성(같은 과목이 같은 선택군 안에서 두 학기에 걸침)은 선택 1회로 센다.
 * 실제 사례: 서울도시과학기술고 2026 입학생 '학과간10 (택1)' — 3학년 1·2학기 연속 과목 3개 중 1과목.
 * 학점은 두 학기 모두 더한다 (교차 편성과 다름).
 */
import { describe, expect, it } from 'vitest'
import { validatePlan } from '../../shared/engine/selection'
import { summarizeCredits } from '../../shared/engine/credits'
import type { CurriculumBundle, CurriculumOffering, SelectionGroup } from '../../shared/types'

function off(id: string, name: string, semester: 1 | 2, credit: number): CurriculumOffering {
  return {
    id, versionId: 'v', schoolId: 's', cohortYear: 2026, trackId: 't', courseOriginalName: name, courseCanonicalId: null, revision: '2022', subjectGroup: '전문', courseCategory: 'specialized',
    requirementType: 'student_choice', grade: 3, semester, creditValue: credit, creditUnit: 'credit', selectionGroupId: 'g', offeringStatus: 'planned', crossSemesterGroup: null, note: null, evidenceIds: ['e1'],
  }
}
const offerings = [off('p1', '플랜트 배관', 1, 5), off('p2', '플랜트 배관', 2, 5), off('a1', '자동 제어 시스템 운영', 1, 5), off('a2', '자동 제어 시스템 운영', 2, 5), off('b1', '건축 설계', 1, 5), off('b2', '건축 설계', 2, 5)]
const group: SelectionGroup = { id: 'g', versionId: 'v', label: '선택군 (학과간10 (택1))', scope: '3학년 전체', memberOfferingIds: offerings.map((o) => o.id), minSelections: null, maxSelections: 1, minCredits: null, maxCredits: null, periodScope: 'grade_year', exceptions: [], verifiedRules: ['3과목 중 1과목 (3학년 1·2학기 연속)'], unknownRules: [], ruleStatus: 'verified', evidenceIds: ['e1'] }
const bundle: CurriculumBundle = { version: { id: 'v', schoolId: 's', cohortYear: 2026, trackId: 't', revision: '2022', status: 'published', reviewStatus: 'approved', documentIds: ['d'], reviewedBy: '사람', reviewedAt: null, publishedAt: null, supersedesId: null, notes: null, isSynthetic: true }, offerings, selectionGroups: [group], documents: [], evidence: [] }

describe('연속 편성 과목의 선택 단위', () => {
  it('한 과목의 두 학기를 함께 고르면 선택 1회 → 모순 없음, 학점은 10', () => {
    const r = validatePlan({ bundle, selectedOfferingIds: ['p1', 'p2'], targetCohortYear: 2026 })
    expect(r.verdict).toBe('no_conflict_within_verified_rules')
    expect(summarizeCredits(bundle, ['p1', 'p2']).selectedConfirmed).toBe(10)
  })
  it('두 과목(네 학기)을 고르면 택1 초과 → 충돌, 대안은 과목 단위(두 학기 포함)', () => {
    const r = validatePlan({ bundle, selectedOfferingIds: ['p1', 'p2', 'a1', 'a2'], targetCohortYear: 2026 })
    expect(r.verdict).toBe('conflicts_with_verified_rules')
    expect(r.violations[0]!.actual).toBe(2)
    expect(r.alternatives.map((a) => a.offeringIds.sort())).toEqual(expect.arrayContaining([['p1', 'p2'], ['a1', 'a2']]))
  })
})
