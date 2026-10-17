/**
 * 교육과정 버전 간 변경 비교. 입학연도·개정·트랙이 다르면 '동일 집단 변경'으로 보여주지 않는다.
 */
import type { CurriculumBundle, CurriculumOffering } from '../types'

export type ChangeKind = 'course_added' | 'course_removed' | 'semester_moved' | 'credit_changed' | 'group_rule_changed' | 'label_only'

export interface CurriculumChange {
  kind: ChangeKind
  course: string
  before: string | null
  after: string | null
  substantive: boolean
}

export interface DiffResult {
  comparable: boolean
  reason: string | null
  changes: CurriculumChange[]
}

function key(o: CurriculumOffering) {
  return `${o.courseOriginalName}`
}

export function diffCurriculum(a: CurriculumBundle, b: CurriculumBundle): DiffResult {
  const va = a.version
  const vb = b.version
  if (va.cohortYear !== vb.cohortYear || va.revision !== vb.revision || va.trackId !== vb.trackId) {
    return {
      comparable: false,
      reason: '입학연도·개정 교육과정·과정이 달라 동일 집단의 변경으로 볼 수 없습니다.',
      changes: [],
    }
  }
  const changes: CurriculumChange[] = []
  const mapA = new Map<string, CurriculumOffering[]>()
  const mapB = new Map<string, CurriculumOffering[]>()
  for (const o of a.offerings) mapA.set(key(o), [...(mapA.get(key(o)) ?? []), o])
  for (const o of b.offerings) mapB.set(key(o), [...(mapB.get(key(o)) ?? []), o])
  for (const [k, listA] of mapA) {
    const listB = mapB.get(k)
    if (!listB) {
      changes.push({ kind: 'course_removed', course: k, before: describe(listA), after: null, substantive: true })
      continue
    }
    const semA = describe(listA)
    const semB = describe(listB)
    if (semA !== semB) {
      const credA = listA.map((o) => o.creditValue).join('/')
      const credB = listB.map((o) => o.creditValue).join('/')
      changes.push({
        kind: credA !== credB ? 'credit_changed' : 'semester_moved',
        course: k,
        before: semA,
        after: semB,
        substantive: true,
      })
    } else {
      const noteA = listA.map((o) => o.note ?? '').join('|')
      const noteB = listB.map((o) => o.note ?? '').join('|')
      if (noteA !== noteB) changes.push({ kind: 'label_only', course: k, before: noteA, after: noteB, substantive: false })
    }
  }
  for (const [k, listB] of mapB) if (!mapA.has(k)) changes.push({ kind: 'course_added', course: k, before: null, after: describe(listB), substantive: true })

  const gA = new Map(a.selectionGroups.map((g) => [g.label, g]))
  for (const g of b.selectionGroups) {
    const prev = gA.get(g.label)
    if (!prev) continue
    const ruleA = `${prev.minSelections}-${prev.maxSelections}/${prev.periodScope}/${prev.ruleStatus}`
    const ruleB = `${g.minSelections}-${g.maxSelections}/${g.periodScope}/${g.ruleStatus}`
    if (ruleA !== ruleB) changes.push({ kind: 'group_rule_changed', course: g.label, before: ruleA, after: ruleB, substantive: true })
  }
  return { comparable: true, reason: null, changes }
}

function describe(list: CurriculumOffering[]): string {
  return list
    .map((o) => `${o.grade}-${o.semester}:${o.creditValue ?? '?'}${o.creditUnit === 'unit' ? '단위' : '학점'}`)
    .sort()
    .join(', ')
}
