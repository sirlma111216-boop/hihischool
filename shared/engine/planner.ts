/**
 * 3년 배움 경로 — 희망 과목 목록을 확인된 편제에 놓고 조합을 검토한다.
 * 범위를 제한한 백트래킹. 노드 수·시간 초과를 상태로 돌려준다.
 */
import { PLANNER_MAX_MS, PLANNER_MAX_NODES } from '../constants'
import type { CurriculumBundle, CurriculumOffering, PlanValidationResult } from '../types'
import { validatePlan } from './selection'

export interface PathSlot {
  grade: 1 | 2 | 3
  semester: 1 | 2
  designated: CurriculumOffering[]
  choiceGroups: { groupId: string | null; label: string; members: CurriculumOffering[]; ruleStatus: string }[]
  status: 'confirmed' | 'empty' // 확인되지 않은 학기는 빈 상태
}

export function buildPathSlots(bundle: CurriculumBundle): PathSlot[] {
  const slots: PathSlot[] = []
  const groupsById = new Map(bundle.selectionGroups.map((g) => [g.id, g]))
  for (const grade of [1, 2, 3] as const) {
    for (const semester of [1, 2] as const) {
      const here = bundle.offerings.filter((o) => o.grade === grade && o.semester === semester)
      const designated = here.filter((o) => o.requirementType === 'school_designated')
      const choice = here.filter((o) => o.requirementType !== 'school_designated')
      const byGroup = new Map<string | null, CurriculumOffering[]>()
      for (const o of choice) {
        const key = o.selectionGroupId
        if (!byGroup.has(key)) byGroup.set(key, [])
        byGroup.get(key)!.push(o)
      }
      const choiceGroups = [...byGroup.entries()].map(([groupId, members]) => {
        const g = groupId ? groupsById.get(groupId) : undefined
        return {
          groupId,
          label: g?.label ?? '선택군 미확인',
          members,
          ruleStatus: g?.ruleStatus ?? 'unverified',
        }
      })
      slots.push({ grade, semester, designated, choiceGroups, status: here.length > 0 ? 'confirmed' : 'empty' })
    }
  }
  return slots
}

/** 희망 과목명(표준화 또는 원문)과 편성의 일치. 비슷한 이름을 자동 동등 과목으로 합치지 않는다 (정확 일치만). */
export function matchWishes(bundle: CurriculumBundle, wishes: string[]): { wish: string; offerings: CurriculumOffering[] }[] {
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  return wishes.map((wish) => ({
    wish,
    offerings: bundle.offerings.filter(
      (o) => norm(o.courseOriginalName) === norm(wish) || (o.courseCanonicalId !== null && norm(o.courseCanonicalId) === norm(wish)),
    ),
  }))
}

export interface SearchResult {
  status: 'complete' | 'node_limit' | 'time_limit'
  nodesVisited: number
  feasible: { offeringIds: string[]; result: PlanValidationResult }[]
}

/**
 * 희망 과목을 모두 포함하면서 확인된 규칙과 충돌하지 않는 조합을 찾는다.
 * 선택군 규칙이 미확인이면 '충족'으로 가정하지 않는다 → insufficient_data 조합은 feasible 에 넣지 않는다.
 */
export function searchFeasibleCombos(
  bundle: CurriculumBundle,
  wishOfferingIds: string[],
  targetCohortYear: number,
  limits: { maxNodes?: number; maxMs?: number } = {},
): SearchResult {
  const maxNodes = limits.maxNodes ?? PLANNER_MAX_NODES
  const maxMs = limits.maxMs ?? PLANNER_MAX_MS
  const start = Date.now()
  let nodes = 0
  const feasible: SearchResult['feasible'] = []
  let status: SearchResult['status'] = 'complete'

  // 선택 가능 후보 = 희망 과목 + 희망 과목이 속한 선택군의 다른 구성원 (범위 제한)
  const wished = new Set(wishOfferingIds)
  const groupsTouched = bundle.selectionGroups.filter((g) => g.memberOfferingIds.some((id) => wished.has(id)))
  const optional = [...new Set(groupsTouched.flatMap((g) => g.memberOfferingIds))].filter((id) => !wished.has(id))

  const base = [...wished]
  const rec = (i: number, acc: string[]) => {
    if (status !== 'complete') return
    nodes += 1
    if (nodes > maxNodes) {
      status = 'node_limit'
      return
    }
    if (Date.now() - start > maxMs) {
      status = 'time_limit'
      return
    }
    const r = validatePlan({ bundle, selectedOfferingIds: acc, targetCohortYear })
    if (r.verdict === 'conflicts_with_verified_rules') return // 가지치기
    if (i === optional.length) {
      if (r.verdict === 'no_conflict_within_verified_rules') feasible.push({ offeringIds: [...acc], result: r })
      return
    }
    rec(i + 1, acc)
    acc.push(optional[i] as string)
    rec(i + 1, acc)
    acc.pop()
  }
  rec(0, base)
  return { status, nodesVisited: nodes, feasible }
}
