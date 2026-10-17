/**
 * 학점 합계 — 필수(학교 지정)·선택(학생이 고른 것)·미확인을 구분한다.
 * - 선택군의 모든 후보 과목 학점을 더하지 않는다.
 * - null 학점은 0 이 아니라 '미확인 과목 n개' 로 센다.
 * - 교차 편성(crossSemesterGroup)은 한 번만 더한다.
 * - 2015 단위와 2022 학점을 섞어 합치지 않는다 (mixedUnits 로 경고).
 * - 졸업 학점 충족 여부는 판정하지 않는다.
 */
import type { CreditSummary, CreditUnit, CurriculumBundle, CurriculumOffering } from '../types'

function dedupe(list: CurriculumOffering[]): CurriculumOffering[] {
  const seen = new Set<string>()
  const out: CurriculumOffering[] = []
  for (const o of list) {
    const key = o.crossSemesterGroup ?? o.id
    if (seen.has(key)) continue
    seen.add(key)
    out.push(o)
  }
  return out
}

export function summarizeCredits(bundle: CurriculumBundle, selectedOfferingIds: string[]): CreditSummary {
  const selectedSet = new Set(selectedOfferingIds)
  const designated = dedupe(bundle.offerings.filter((o) => o.requirementType === 'school_designated'))
  const selected = dedupe(bundle.offerings.filter((o) => selectedSet.has(o.id) && o.requirementType !== 'school_designated'))

  const units = new Set<CreditUnit>()
  for (const o of [...designated, ...selected]) if (o.creditValue !== null) units.add(o.creditUnit)
  const mixedUnits = units.size > 1
  const unit: CreditUnit = units.size === 1 ? [...units][0]! : units.size === 0 ? 'unknown' : 'unknown'

  const sum = (list: CurriculumOffering[]) => list.reduce((a, o) => a + (o.creditValue ?? 0), 0)
  const unknownCount = (list: CurriculumOffering[]) => list.filter((o) => o.creditValue === null).length

  const designatedUnknownCount = unknownCount(designated)
  const selectedUnknownCount = unknownCount(selected)

  const notes: string[] = []
  if (designatedUnknownCount + selectedUnknownCount > 0) notes.push(`학점 미확인 과목 ${designatedUnknownCount + selectedUnknownCount}개는 합계에 포함하지 않았습니다.`)
  if (mixedUnits) notes.push('단위(2015)와 학점(2022)이 섞여 있어 합계를 같은 기준으로 볼 수 없습니다.')
  notes.push('졸업 학점 충족 여부는 판정하지 않습니다.')

  return {
    designatedConfirmed: sum(designated.filter((o) => o.creditValue !== null)),
    designatedUnknownCount,
    selectedConfirmed: sum(selected.filter((o) => o.creditValue !== null)),
    selectedUnknownCount,
    unit,
    mixedUnits,
    graduationJudgement: 'not_evaluated',
    note: notes.join(' '),
  }
}

/** 표의 합계(원문 기재)와 계산 결과를 비교해 검토 경고를 만든다. */
export function compareWithStatedTotal(stated: number | null, computed: number, unknownCount: number): string | null {
  if (stated === null) return null
  if (unknownCount > 0) return `원문 합계 ${stated} 와 비교할 수 없습니다 (학점 미확인 과목 ${unknownCount}개).`
  if (stated !== computed) return `원문 합계 ${stated} 와 계산 결과 ${computed} 가 다릅니다. 검토가 필요합니다.`
  return null
}
