/**
 * 3년 6학기 매트릭스. 표 머리와 과목 열 고정, 학기·학년 묶음, 반복 편성 표시.
 * 셀 병합을 펼쳐 중복 학점을 계산하지 않는다 (교차 편성은 한 단위).
 */
import { useMemo, useState } from 'react'
import type { CurriculumBundle, CurriculumOffering, SelectionGroup } from '@shared/types'
import { COURSE_CATEGORY_LABEL, OFFERING_STATUS_LABEL } from '@shared/types'
import { formatCredit } from '@shared/format'
import { EvidenceButton, Tone } from './ui'
import { useEvidence } from '../lib/store'

export type MatrixView = 'matrix' | 'group' | 'interest' | 'requirement' | 'selection' | 'source'

export function CurriculumMatrix({ bundle, interest, selected, onToggle, view, highlightGroupIds = [] }: { bundle: CurriculumBundle; interest: string[]; selected: Set<string>; onToggle?: (id: string) => void; view: MatrixView; highlightGroupIds?: string[] }) {
  const { open } = useEvidence()
  const groups = useMemo(() => new Map(bundle.selectionGroups.map((g) => [g.id, g])), [bundle])
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  const interestSet = useMemo(() => new Set(interest.map(norm)), [interest])
  const isInterest = (o: CurriculumOffering) => interestSet.has(norm(o.courseOriginalName)) || (o.courseCanonicalId !== null && interestSet.has(norm(o.courseCanonicalId)))
  const semesters: { grade: 1 | 2 | 3; semester: 1 | 2 }[] = [
    { grade: 1, semester: 1 }, { grade: 1, semester: 2 }, { grade: 2, semester: 1 }, { grade: 2, semester: 2 }, { grade: 3, semester: 1 }, { grade: 3, semester: 2 },
  ]
  let offerings = bundle.offerings
  if (view === 'interest') offerings = offerings.filter(isInterest)
  if (view === 'selection') offerings = offerings.filter((o) => o.selectionGroupId)
  const rowsBy = view === 'group' ? 'subjectGroup' : view === 'requirement' ? 'requirementType' : 'subjectGroup'
  const rowKeys = [...new Set(offerings.map((o) => (rowsBy === 'requirementType' ? (o.requirementType === 'school_designated' ? '학교 지정' : o.requirementType === 'student_choice' ? '학생 선택' : '지정/선택 미확인') : o.subjectGroup || '교과군 미확인')))]
  // 같은 과목이 여러 학기에 있을 때
  const occurrences = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of bundle.offerings) m.set(o.courseOriginalName, (m.get(o.courseOriginalName) ?? 0) + 1)
    return m
  }, [bundle])

  if (view === 'source') return <SourceView bundle={bundle} />

  return (
    <>
      <div className="legend"><span className="l-des">학교 지정</span><span className="l-cho">학생 선택</span><span className="l-sel">선택함</span><span>관심 과목은 테두리 강조</span></div>
      <div className="table-wrap">
        <table className="data matrix">
          <caption>{bundle.version.cohortYear} 입학생 · {bundle.version.revision} 개정 · 3년 6학기 편성 {bundle.version.trackId ? '(과정별)' : ''} — 셀의 학점은 원문 표기이며 교차 편성은 한 번만 이수합니다.</caption>
          <thead>
            <tr>
              <th scope="col">{rowsBy === 'requirementType' ? '구분' : '교과(군)'}</th>
              {semesters.map((s) => (
                <th key={`${s.grade}-${s.semester}`} scope="col">{s.grade}학년 {s.semester}학기</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowKeys.length === 0 && <tr><td colSpan={7} className="muted">표시할 편성이 없습니다.</td></tr>}
            {rowKeys.map((rk) => (
              <tr key={rk}>
                <th scope="row">{rk}</th>
                {semesters.map((s) => {
                  const cell = offerings.filter((o) => o.grade === s.grade && o.semester === s.semester && (rowsBy === 'requirementType' ? (o.requirementType === 'school_designated' ? '학교 지정' : o.requirementType === 'student_choice' ? '학생 선택' : '지정/선택 미확인') : o.subjectGroup || '교과군 미확인') === rk)
                  return (
                    <td key={`${s.grade}-${s.semester}`} className="cell">
                      {cell.map((o) => {
                        const g = o.selectionGroupId ? groups.get(o.selectionGroupId) : undefined
                        const sel = selected.has(o.id)
                        const cellId = `cell-${o.id}`
                        return (
                          <div key={o.id} id={cellId} className={`course ${o.requirementType === 'school_designated' ? 'designated' : 'choice'} ${sel ? 'selected' : ''} ${isInterest(o) ? 'interest' : ''} ${g && highlightGroupIds.includes(g.id) ? 'interest' : ''}`}>
                            <div className="meta">
                              <span>{g ? g.label : o.requirementType === 'school_designated' ? '지정' : '선택군 없음'}</span>
                              <span className="num">{formatCredit(o.creditValue, o.creditUnit)}</span>
                            </div>
                            <div className="name">
                              {o.courseOriginalName}
                              {(occurrences.get(o.courseOriginalName) ?? 0) > 1 && <span className="muted small"> {o.crossSemesterGroup ? '(교차 편성·한 학기만)' : `(${occurrences.get(o.courseOriginalName)}개 학기)`}</span>}
                            </div>
                            <div className="meta">
                              <span>{COURSE_CATEGORY_LABEL[o.courseCategory]} · {OFFERING_STATUS_LABEL[o.offeringStatus].split(' / ')[0]}</span>
                              <EvidenceButton ids={o.evidenceIds} onOpen={open} />
                            </div>
                            {o.note && <div className="muted small">{o.note}</div>}
                            {onToggle && o.requirementType !== 'school_designated' && (
                              <label className="check small">
                                <input type="checkbox" checked={sel} onChange={() => onToggle(o.id)} aria-label={`${o.courseOriginalName} 선택`} /> 선택
                              </label>
                            )}
                          </div>
                        )
                      })}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function SelectionGroupList({ groups, offerings, highlight = [] }: { groups: SelectionGroup[]; offerings: CurriculumOffering[]; highlight?: string[] }) {
  const { open } = useEvidence()
  const byId = new Map(offerings.map((o) => [o.id, o]))
  if (groups.length === 0) return <p className="muted">이 자료에서 구조화된 선택군이 없습니다. 학생 선택 과목이 있더라도 선택 조건은 '확인 필요'입니다.</p>
  return (
    <div className="table-wrap">
      <table className="data">
        <caption>선택군과 확인된 규칙. 규칙이 미확인·충돌이면 조합 판단을 보류합니다.</caption>
        <thead><tr><th scope="col">선택군</th><th scope="col">범위</th><th scope="col">구성 과목</th><th scope="col">선택 수</th><th scope="col">학점 한도</th><th scope="col">규칙 상태</th><th scope="col">근거</th></tr></thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id} className={highlight.includes(g.id) ? 'diff' : ''}>
              <th scope="row">{g.label}</th>
              <td>{g.scope}<span className="cellnote">{g.periodScope === 'semester' ? '학기 단위' : g.periodScope === 'grade_year' ? '학년 전체' : g.periodScope === 'all_years' ? '3년 전체' : '기간 미확인'}</span></td>
              <td>{[...new Set(g.memberOfferingIds.map((id) => byId.get(id)?.courseOriginalName ?? id))].join(', ')}</td>
              <td className="num">{g.minSelections === null && g.maxSelections === null ? '미확인' : `${g.minSelections ?? '?'}~${g.maxSelections ?? '?'}`}</td>
              <td className="num">{g.maxCredits !== null ? `최대 ${g.maxCredits}` : '없음/미확인'}</td>
              <td>
                {g.ruleStatus === 'verified' ? <Tone tone="ok">확인됨</Tone> : g.ruleStatus === 'conflict' ? <Tone tone="warn">자료 충돌</Tone> : <Tone tone="unknown">규칙 확인 필요</Tone>}
                {g.verifiedRules.length > 0 && <span className="cellnote">{g.verifiedRules.join(' / ')}</span>}
                {g.unknownRules.length > 0 && <span className="cellnote">미확인: {g.unknownRules.join(' / ')}</span>}
                {g.exceptions.length > 0 && <span className="cellnote">예외: {g.exceptions.join(' / ')}</span>}
              </td>
              <td><EvidenceButton ids={g.evidenceIds} onOpen={open} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SourceView({ bundle }: { bundle: CurriculumBundle }) {
  const { open } = useEvidence()
  const [sortKey, setSortKey] = useState<'grade' | 'name'>('grade')
  const evById = new Map(bundle.evidence.map((e) => [e.id, e]))
  const rows = [...bundle.offerings].sort((a, b) => (sortKey === 'grade' ? a.grade - b.grade || a.semester - b.semester || a.courseOriginalName.localeCompare(b.courseOriginalName, 'ko') : a.courseOriginalName.localeCompare(b.courseOriginalName, 'ko')))
  return (
    <div className="table-wrap">
      <table className="data">
        <caption>원문 대조 보기 — 과목명 원문, 표준화 과목명, 근거 위치. 정렬: {sortKey === 'grade' ? '학년·학기' : '과목명'}</caption>
        <thead>
          <tr>
            <th scope="col"><button type="button" className="sortbtn" onClick={() => setSortKey('name')} aria-sort={sortKey === 'name' ? 'ascending' : 'none'}>과목명 원문</button></th>
            <th scope="col">표준화명</th>
            <th scope="col"><button type="button" className="sortbtn" onClick={() => setSortKey('grade')} aria-sort={sortKey === 'grade' ? 'ascending' : 'none'}>학년·학기</button></th>
            <th scope="col">학점</th>
            <th scope="col">지정/선택</th>
            <th scope="col">원문 위치</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const ev = o.evidenceIds.map((id) => evById.get(id)).filter(Boolean)
            return (
              <tr key={o.id}>
                <th scope="row">{o.courseOriginalName}</th>
                <td>{o.courseCanonicalId ?? <span className="muted">미지정 (자동 합치지 않음)</span>}</td>
                <td>{o.grade}-{o.semester}</td>
                <td className="num">{formatCredit(o.creditValue, o.creditUnit)}</td>
                <td>{o.requirementType === 'school_designated' ? '학교 지정' : o.requirementType === 'student_choice' ? '학생 선택' : '미확인'}</td>
                <td>
                  {ev.length === 0 ? <span className="muted">근거 없음</span> : ev.map((e) => (
                    <div key={e!.id} className="small">
                      {e!.pdfPageIndex !== null ? `PDF ${e!.pdfPageIndex + 1}쪽` : ''}{e!.printedPageLabel ? ` (인쇄 ${e!.printedPageLabel}쪽)` : ''}{e!.tableId ? ` 표 ${e!.tableId}` : ''}{e!.rowIndex !== null ? ` 행 ${e!.rowIndex}` : ''}{e!.paragraphAnchor ? ` ${e!.paragraphAnchor}` : ''} <EvidenceButton ids={[e!.id]} onOpen={open} label="열기" />
                    </div>
                  ))}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
