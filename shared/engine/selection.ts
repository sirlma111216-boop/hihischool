/**
 * 선택군 규칙 엔진 — 결정론적. LLM 을 쓰지 않는다.
 *
 * 입력: 교육과정 묶음(편성·선택군) + 학생이 선택한 편성 id 목록.
 * 출력: '확인된 규칙 내 모순 없음' / '확인된 규칙과 충돌' / '확인 자료 부족' 과 그 근거.
 *
 * 원칙
 * - 같은 학기라는 이유만으로 충돌로 보지 않는다. 선택군 규칙이 있어야 충돌이다.
 * - 선택군 규칙이 unverified/conflict 이면 판단을 보류한다.
 * - 선택군에 속하지 않은 과목은 "규칙 없음" 이므로 판단 보류 대상으로 기록한다.
 * - 학년 전체/3년 전체 범위 규칙은 학기가 달라도 적용한다.
 * - 교차 편성(crossSemesterGroup)은 한 번 선택으로 센다.
 * - 편제표상 가능해도 실제 개설·인원·시간표를 보장하지 않는다.
 */
import type {
  CreditSummary,
  CurriculumBundle,
  CurriculumOffering,
  PlanAlternative,
  PlanUnknown,
  PlanValidationResult,
  PlanViolation,
  SelectionGroup,
} from '../types'
import { summarizeCredits } from './credits'

export const PLAN_DISCLAIMER =
  '편제표의 확인된 규칙에 대한 판단입니다. 실제 개설·수강 인원·시간표·학교 승인은 보장하지 않습니다.'

export interface ValidatePlanInput {
  bundle: CurriculumBundle
  selectedOfferingIds: string[]
  /** 요청한 대상 입학연도. 묶음의 입학연도와 다르면 판단하지 않는다. */
  targetCohortYear: number
}

function periodRangeLabel(group: SelectionGroup, members: CurriculumOffering[]): string {
  const grades = [...new Set(members.map((m) => m.grade))].sort()
  const sems = [...new Set(members.map((m) => `${m.grade}-${m.semester}`))].sort()
  switch (group.periodScope) {
    case 'semester':
      return sems.map((s) => s.replace('-', '학년 ') + '학기').join(', ')
    case 'grade_year':
      return grades.map((g) => `${g}학년 전체`).join(', ')
    case 'all_years':
      return '3년 전체'
    default:
      return group.scope || '적용 기간 미확인'
  }
}

/** 교차 편성 그룹을 한 단위로 묶어 '선택 단위' 수를 센다. */
function countSelectionUnits(members: CurriculumOffering[]): number {
  const seen = new Set<string>()
  let n = 0
  for (const m of members) {
    const key = m.crossSemesterGroup ?? m.id
    if (seen.has(key)) continue
    seen.add(key)
    n += 1
  }
  return n
}

export function validatePlan(input: ValidatePlanInput): PlanValidationResult {
  const { bundle, selectedOfferingIds, targetCohortYear } = input
  const offeringById = new Map(bundle.offerings.map((o) => [o.id, o]))
  const selected = selectedOfferingIds
    .map((id) => offeringById.get(id))
    .filter((o): o is CurriculumOffering => Boolean(o))

  const violations: PlanViolation[] = []
  const unknowns: PlanUnknown[] = []
  const alternatives: PlanAlternative[] = []
  const evaluatedGroupIds: string[] = []

  const baseCredits = summarizeCredits(bundle, selectedOfferingIds)

  // 입학연도 불일치: 과거 자료로 현재 입학생 경로를 확정하지 않는다.
  if (bundle.version.cohortYear !== targetCohortYear) {
    unknowns.push({
      groupId: null,
      groupLabel: null,
      reason: 'cohort_mismatch',
      offeringIds: selectedOfferingIds,
      message: `요청한 ${targetCohortYear} 입학생 자료가 아니라 ${bundle.version.cohortYear} 입학생 자료입니다. 참고용으로만 열 수 있으며 경로 검증에 쓰지 않습니다.`,
      question: `${targetCohortYear} 입학생에게 적용되는 교육과정 편제표가 공개되어 있는지 문의하세요.`,
    })
    return finish('insufficient_data', violations, unknowns, alternatives, baseCredits, evaluatedGroupIds)
  }

  const groupsById = new Map(bundle.selectionGroups.map((g) => [g.id, g]))
  const groupOfOffering = new Map<string, SelectionGroup>()
  for (const g of bundle.selectionGroups) for (const id of g.memberOfferingIds) groupOfOffering.set(id, g)

  // 선택된 과목 중 학생 선택인데 선택군이 없는 과목 → 규칙 없음 (보류 기록)
  const noGroup = selected.filter((o) => o.requirementType === 'student_choice' && !groupOfOffering.has(o.id))
  if (noGroup.length > 0) {
    unknowns.push({
      groupId: null,
      groupLabel: null,
      reason: 'no_group',
      offeringIds: noGroup.map((o) => o.id),
      message: `${noGroup.map((o) => o.courseOriginalName).join(', ')}: 선택 조건(선택군 규칙)이 자료에서 확인되지 않았습니다.`,
      question: `${noGroup.map((o) => o.courseOriginalName).join(', ')} 과목의 선택 조건(동시 선택 가능 여부·선택 개수)을 문의하세요.`,
    })
  }

  // 선택군별 검사
  const touchedGroups = new Set<string>()
  for (const o of selected) {
    const g = groupOfOffering.get(o.id)
    if (g) touchedGroups.add(g.id)
  }

  for (const gid of touchedGroups) {
    const g = groupsById.get(gid)
    if (!g) continue
    const members = g.memberOfferingIds.map((id) => offeringById.get(id)).filter((o): o is CurriculumOffering => Boolean(o))
    const chosen = selected.filter((o) => g.memberOfferingIds.includes(o.id))
    const chosenIds = chosen.map((o) => o.id)
    const range = periodRangeLabel(g, members)

    if (g.ruleStatus !== 'verified') {
      unknowns.push({
        groupId: g.id,
        groupLabel: g.label,
        reason: g.ruleStatus === 'conflict' ? 'rule_conflict' : 'rule_unverified',
        offeringIds: chosenIds,
        message:
          g.ruleStatus === 'conflict'
            ? `${g.label}: 공식 문서들이 서로 다른 선택 조건을 제시하여 판단을 보류합니다.`
            : `${g.label}: 선택 개수 규칙이 원문에서 확인되지 않아 판단을 보류합니다.${g.unknownRules.length ? ' (' + g.unknownRules.join('; ') + ')' : ''}`,
        question: `${g.label}(${range})에서 ${chosen.map((c) => c.courseOriginalName).join(', ')}의 동시 선택 가능 여부와 선택 개수를 문의하세요.`,
      })
      continue
    }

    evaluatedGroupIds.push(g.id)
    const units = countSelectionUnits(chosen)

    if (g.maxSelections !== null && units > g.maxSelections) {
      violations.push({
        kind: 'max_selections',
        groupId: g.id,
        groupLabel: g.label,
        rule: g.verifiedRules.join(' / ') || `최대 ${g.maxSelections}과목 선택`,
        chosenOfferingIds: chosenIds,
        limit: g.maxSelections,
        actual: units,
        periodScope: g.periodScope,
        periodRange: range,
        evidenceIds: g.evidenceIds,
        message: `${g.label}(${range})의 선택 수(${g.maxSelections}과목)를 초과합니다. 선택한 과목: ${chosen.map((c) => c.courseOriginalName).join(', ')}`,
      })
      // 근거 안에서 가능한 다른 조합: 선택 수 한도만큼의 부분집합 (작은 경우만 열거)
      const cands = dedupeCrossSemester(chosen)
      for (const combo of chooseK(cands, g.maxSelections).slice(0, 6)) {
        alternatives.push({
          groupId: g.id,
          groupLabel: g.label,
          offeringIds: combo.map((c) => c.id),
          description: `${g.label}에서 ${combo.map((c) => c.courseOriginalName).join(' + ')} 만 선택`,
        })
      }
    }
    // 최소 선택 수는 "최대 n과목" 각주를 최소 필수로 해석하지 않는다. minSelections 가 명시된 경우만 검사하며
    // 학생이 아직 선택을 마치지 않았을 수 있으므로 위반이 아닌 '안내'로만 남긴다 (충돌로 올리지 않음).

    // 학점 한도
    if (g.maxCredits !== null) {
      const known = chosen.filter((c) => c.creditValue !== null)
      const unknownCredit = chosen.filter((c) => c.creditValue === null)
      const sum = sumUnits(dedupeCrossSemester(known))
      if (unknownCredit.length > 0) {
        unknowns.push({
          groupId: g.id,
          groupLabel: g.label,
          reason: 'credit_missing',
          offeringIds: unknownCredit.map((c) => c.id),
          message: `${g.label}: ${unknownCredit.map((c) => c.courseOriginalName).join(', ')}의 학점이 확인되지 않아 학점 한도 판단을 보류합니다.`,
          question: `${unknownCredit.map((c) => c.courseOriginalName).join(', ')}의 학점(단위)을 문의하세요.`,
        })
      } else if (sum > g.maxCredits) {
        violations.push({
          kind: 'max_credits',
          groupId: g.id,
          groupLabel: g.label,
          rule: g.verifiedRules.join(' / ') || `최대 ${g.maxCredits}학점`,
          chosenOfferingIds: chosenIds,
          limit: g.maxCredits,
          actual: sum,
          periodScope: g.periodScope,
          periodRange: range,
          evidenceIds: g.evidenceIds,
          message: `${g.label}(${range})의 학점 한도(${g.maxCredits})를 초과합니다 (선택 합계 ${sum}).`,
        })
      }
    }
  }

  let verdict: PlanValidationResult['verdict']
  if (violations.length > 0) verdict = 'conflicts_with_verified_rules'
  else if (unknowns.length > 0) verdict = 'insufficient_data'
  else verdict = 'no_conflict_within_verified_rules'

  return finish(verdict, violations, unknowns, alternatives, baseCredits, evaluatedGroupIds)
}

function finish(
  verdict: PlanValidationResult['verdict'],
  violations: PlanViolation[],
  unknowns: PlanUnknown[],
  alternatives: PlanAlternative[],
  credits: CreditSummary,
  evaluatedGroupIds: string[],
): PlanValidationResult {
  return { verdict, violations, unknowns, alternatives, credits, evaluatedGroupIds, disclaimer: PLAN_DISCLAIMER }
}

function dedupeCrossSemester(list: CurriculumOffering[]): CurriculumOffering[] {
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

function sumUnits(list: CurriculumOffering[]): number {
  return list.reduce((acc, o) => acc + (o.creditValue ?? 0), 0)
}

export function chooseK<T>(items: T[], k: number): T[][] {
  if (k <= 0) return [[]]
  if (items.length < k) return []
  const out: T[][] = []
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push([...acc])
      return
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i] as T)
      rec(i + 1, acc)
      acc.pop()
    }
  }
  rec(0, [])
  return out
}

/** 특정 두 과목(편성 id)을 함께 선택할 수 있는지 — 근거 검색 패널용 간편 질의. */
export function canSelectTogether(bundle: CurriculumBundle, offeringIdA: string, offeringIdB: string, targetCohortYear: number) {
  return validatePlan({ bundle, selectedOfferingIds: [offeringIdA, offeringIdB], targetCohortYear })
}
