import { describe, expect, it } from 'vitest'
import { buildPathSlots, matchWishes, searchFeasibleCombos } from '../../shared/engine/planner'
import { diffCurriculum } from '../../shared/engine/diff'
import { SYN, syntheticBundle } from '../../fixtures/synthetic'

describe('경로 슬롯', () => {
  it('확인되지 않은 학기는 빈 상태로 남긴다', () => {
    const slots = buildPathSlots(syntheticBundle(SYN.B27))
    const s32 = slots.find((s) => s.grade === 3 && s.semester === 2)!
    expect(s32.status).toBe('empty')
    const s21 = slots.find((s) => s.grade === 2 && s.semester === 1)!
    expect(s21.choiceGroups.map((g) => g.label)).toContain('선택군 G')
  })
  it('비슷한 이름을 자동 동등 과목으로 합치지 않는다 (정확 일치만)', () => {
    const m = matchWishes(syntheticBundle(SYN.A27), ['과목 A', '과목A', '과목 AA'])
    expect(m[0]!.offerings).toHaveLength(1)
    expect(m[1]!.offerings).toHaveLength(1) // 공백 변형은 같은 이름
    expect(m[2]!.offerings).toHaveLength(0)
  })
})

describe('조합 탐색', () => {
  it('희망 과목 A 를 포함하는 충돌 없는 조합을 찾고 미확인 규칙은 충족으로 가정하지 않는다', () => {
    const r = searchFeasibleCombos(syntheticBundle(SYN.A27), ['off_a27_A'], 2027)
    expect(r.status).toBe('complete')
    expect(r.feasible.length).toBeGreaterThan(0)
    for (const f of r.feasible) {
      expect(f.offeringIds).toContain('off_a27_A')
      expect(f.result.verdict).toBe('no_conflict_within_verified_rules')
      expect(f.offeringIds).not.toContain('off_a27_B')
    }
  })
  it('노드 제한을 넘으면 중단 상태를 돌려준다', () => {
    const r = searchFeasibleCombos(syntheticBundle(SYN.B27), ['off_b27_A'], 2027, { maxNodes: 2 })
    expect(r.status).toBe('node_limit')
  })
})

describe('버전 비교', () => {
  it('입학연도가 다르면 동일 집단 변경으로 보여주지 않는다', () => {
    const d = diffCurriculum(syntheticBundle(SYN.A26), syntheticBundle(SYN.A27))
    expect(d.comparable).toBe(false)
  })
  it('같은 집단에서 학점 변화·과목 추가를 구분한다', () => {
    const a = syntheticBundle(SYN.B27)
    const b = syntheticBundle(SYN.B27)
    b.offerings = b.offerings.map((o) => (o.id === 'off_b27_A' ? { ...o, creditValue: 4 } : o))
    b.offerings.push({ ...b.offerings[0]!, id: 'off_new', courseOriginalName: '새 과목' })
    const d = diffCurriculum(a, b)
    expect(d.comparable).toBe(true)
    expect(d.changes.find((c) => c.course === '과목 A')?.kind).toBe('credit_changed')
    expect(d.changes.find((c) => c.course === '새 과목')?.kind).toBe('course_added')
  })
})
