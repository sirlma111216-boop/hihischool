import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWorkspace, useEvidence } from '../lib/store'
import { useAsync, useDocumentTitle } from '../lib/hooks'
import { apiPost } from '../lib/api'
import type { CompareColumn, CompareResponse } from '../lib/types'
import { Button, Empty, ErrorBox, EvidenceButton, Interpretation, Skeleton, StatusBadge, SyntheticBadge, Tone } from '../components/ui'
import { ESTABLISHMENT_LABEL, GENDER_LABEL, SCHOOL_TYPE_LABEL, SELECTION_AUTHORITY_LABEL } from '@shared/types'
import { downloadBlob, toCsv } from '../lib/export'
import { formatCalendarDate } from '@shared/format'
import { DEFAULT_COMPARE_SCHOOLS, MAX_COMPARE_SCHOOLS } from '@shared/constants'

type Row = { key: string; group: string; label: string; cells: (col: CompareColumn) => { text: string; node?: ReactNode; status?: 'ok' | 'cond' | 'unknown' | 'bad' } }

export default function Compare() {
  useDocumentTitle('학교 비교')
  const { state, dispatch } = useWorkspace()
  const { open } = useEvidence()
  const [sp, setSp] = useSearchParams()
  // 공유 링크: 공개 학교 ID 와 입학연도만 URL 에서 읽는다 (학생 정보 없음)
  useEffect(() => {
    const ids = (sp.get('schools') ?? '').split(',').filter(Boolean)
    const cohort = Number(sp.get('cohort'))
    if (ids.length > 0) {
      dispatch({ type: 'compare.set', ids })
      if (Number.isInteger(cohort) && cohort > 2000) dispatch({ type: 'cohort', year: cohort })
      setSp(new URLSearchParams(), { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [diffOnly, setDiffOnly] = useState(false)
  const [interestOnly, setInterestOnly] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [important, setImportant] = useState<string[]>([])
  const [mobileIdx, setMobileIdx] = useState(0)
  const key = JSON.stringify({ c: state.compare, y: state.cohortYear, t: state.trackChoice, i: state.interestCourses })
  const r = useAsync(() => apiPost<CompareResponse>('/api/compare', { schoolIds: state.compare, cohortYear: state.cohortYear, trackIds: Object.fromEntries(state.compare.map((id) => [id, state.trackChoice[id] ?? null])), interestCourses: state.interestCourses }), key, state.compare.length > 0)

  const rows: Row[] = useMemo(() => {
    const factRow = (field: string, label: string): Row => ({
      key: `fact:${field}`,
      group: '규모 지표',
      label,
      cells: (col) => {
        const fs = col.facts.filter((f) => f.field === field).sort((a, b) => (b.basisYear ?? 0) - (a.basisYear ?? 0))
        const f = fs[0]
        if (!f) return { text: '미수집', status: 'unknown' }
        if (f.status !== 'confirmed') return { text: `${f.status === 'no_data' ? '미공개' : '미확인'}${f.basisYear ? ` (${f.basisYear})` : ''}`, status: 'unknown' }
        return { text: `${typeof f.value === 'number' ? f.value.toLocaleString() : String(f.value)}${f.unit ?? ''} (${f.basisYear})`, status: 'ok', node: <><span className="num">{typeof f.value === 'number' ? f.value.toLocaleString() : String(f.value)}{f.unit ?? ''}</span><span className="cellnote">{f.basisYear} 기준 · {f.definition ?? '정의 미확인'}</span> <EvidenceButton ids={f.evidenceIds} onOpen={open} /></> }
      },
    })
    const base: Row[] = [
      { key: 'basis', group: '기준', label: '자료 상태 (교육과정)', cells: (col) => { const c = col.curriculum; if (!c) return { text: '학교 없음', status: 'bad' }; const t = c.status === 'available' ? `공개 · ${c.reviewStatus === 'approved' ? '검토 완료' : '검토 미확인'} · ${c.revision} 개정` : c.status === 'unreviewed_only' ? '검토 대기 (공개 전)' : c.status === 'track_required' ? '과정 선택 필요' : c.status === 'cohort_not_available' ? `해당 입학생 미확인 (보유: ${c.availableCohortYears.join(', ') || '없음'})` : '미수집'; return { text: t, status: c.status === 'available' ? 'ok' : c.status === 'track_required' ? 'cond' : 'unknown' } } },
      { key: 'type', group: '학교', label: '유형 · 선발 방식', cells: (col) => { const s = col.school!; const rule = col.admissionRules[0]; return { text: `${SCHOOL_TYPE_LABEL[s.schoolType]} · ${rule ? SELECTION_AUTHORITY_LABEL[rule.selectionAuthority] : '규정 미확인'}`, status: rule ? 'ok' : 'unknown', node: <>{SCHOOL_TYPE_LABEL[s.schoolType]}<span className="cellnote">{rule ? `${SELECTION_AUTHORITY_LABEL[rule.selectionAuthority]} (${rule.admissionYear})` : '해당 연도 규정 미확인'}</span>{rule && <EvidenceButton ids={rule.evidenceIds} onOpen={open} />}</> } } },
      { key: 'est', group: '학교', label: '설립 · 공학 · 자치구', cells: (col) => { const s = col.school!; return { text: `${ESTABLISHMENT_LABEL[s.establishment]} · ${GENDER_LABEL[s.gender]} · ${s.district}`, status: 'ok' } } },
      { key: 'commute', group: '접근성', label: '사용자 확인 통학', cells: (col) => { const uc = state.session?.userCommutes.find((u) => u.schoolId === col.schoolId); return uc ? { text: `${uc.mode} ${uc.minutes ?? '?'}분 (${uc.checkedOn ?? '확인일 미기록'}, ${uc.source})`, status: 'ok' } : { text: '미확인 (직선거리로 환산하지 않음)', status: 'unknown' } } },
    ]
    const interest: Row[] = state.interestCourses.map((name) => ({
      key: `interest:${name}`,
      group: '관심 과목',
      label: name,
      cells: (col) => {
        const it = col.interest.find((x) => x.name === name)
        if (!it) return { text: '—', status: 'unknown' }
        if (it.status === 'confirmed') {
          const desc = it.offerings.map((o) => `${o.grade}-${o.semester} ${o.creditValue ?? '?'}${o.creditUnit === 'unit' ? '단위' : '학점'} ${o.requirementType === 'school_designated' ? '지정' : '선택'}`).join(' · ')
          const groups = it.groups.map((g) => `${g.label}: ${g.ruleStatus === 'verified' ? (g.maxSelections !== null ? `${g.minSelections ?? '?'}~${g.maxSelections}과목` : '규칙 확인') : '규칙 미확인'}`).join(' · ')
          return { text: `편성 ${desc}${groups ? ` / ${groups}` : ''}`, status: it.groups.some((g) => g.ruleStatus !== 'verified') ? 'cond' : 'ok', node: <><StatusBadge status="confirmed" label="편성 확인" /><span className="cellnote">{desc} · 개설 미확인</span>{groups && <span className="cellnote">{groups}</span>}<EvidenceButton ids={[...new Set([...it.offerings.flatMap((o) => o.evidenceIds), ...it.groups.flatMap((g) => g.evidenceIds)])]} onOpen={open} /></> }
        }
        if (it.status === 'confirmed_absent') return { text: '공개 자료에 없음 (확인된 미편성)', status: 'bad', node: <StatusBadge status="confirmed_absent" label="이 자료에 없음" /> }
        if (it.status === 'track_required') return { text: '과정 선택 필요', status: 'cond' }
        return { text: '자료 없어 미확인', status: 'unknown', node: <StatusBadge status="not_collected" label="자료 미확인" /> }
      },
    }))
    const curr: Row[] = [
      { key: 'groups', group: '교육과정', label: '선택군 수 · 규칙 미확인', cells: (col) => { const c = col.curriculum; if (!c || c.status !== 'available') return { text: '비교 불가', status: 'unknown' }; return { text: `${c.groupCount}개 · 미확인 ${c.unverifiedGroupCount}`, status: c.unverifiedGroupCount ? 'cond' : 'ok' } } },
      { key: 'offerings', group: '교육과정', label: '편성 과목 수 (확인된 자료 기준)', cells: (col) => { const c = col.curriculum; if (!c || c.status !== 'available') return { text: '비교 불가', status: 'unknown' }; return { text: `${c.offeringCount}`, status: 'ok' } } },
      { key: 'programs', group: '프로그램·시설', label: '실제 확인된 프로그램', cells: (col) => (col.programs.length ? { text: col.programs.map((p) => `${p.name} (${p.phase === 'plan' ? '계획' : p.phase === 'result' ? '결과' : p.phase === 'promotion' ? '홍보' : '미확인'})`).join(', '), status: 'ok' } : { text: '확인된 항목 없음', status: 'unknown' }) },
    ]
    const stats = [factRow('students.total', '학생 수'), factRow('classes.total', '학급 수'), factRow('teachers.total', '교원 수 (전체)')]
    const adm: Row[] = [
      { key: 'events', group: '입학 일정', label: `${state.cohortYear} 주요 일정`, cells: (col) => (col.admissionEvents.length ? { text: col.admissionEvents.map((e) => `${formatCalendarDate(e.date)} ${e.title}`).join(' / '), status: 'ok', node: <ul style={{ margin: 0, paddingLeft: 16 }}>{col.admissionEvents.map((e) => <li key={e.id} className="small">{formatCalendarDate(e.date)}{e.time ? ` ${e.time}` : ''} {e.title} <EvidenceButton ids={e.evidenceIds} onOpen={open} /></li>)}</ul> } : { text: '일정 미확인', status: 'unknown' }) },
      { key: 'docs', group: '원문', label: '승인된 원문 문서', cells: (col) => ({ text: `${col.documents.length}건`, status: col.documents.length ? 'ok' : 'unknown' }) },
    ]
    return [...base, ...interest, ...curr, ...stats, ...adm]
  }, [state.interestCourses, state.cohortYear, state.session, open])

  if (state.compare.length === 0) return <Empty title="비교할 학교를 담아 주세요" actions={<Link className="btn primary" to="/schools">학교 찾기</Link>}>기본 {DEFAULT_COMPARE_SCHOOLS}개교, 최대 {MAX_COMPARE_SCHOOLS}개교를 같은 입학연도 기준으로 비교합니다.</Empty>
  if (r.error) return <ErrorBox error={r.error} retry={r.reload} />
  if (!r.data) return <Skeleton lines={8} />
  const d = r.data
  const cols = d.columns.filter((c) => c.status === 'ok')
  const cellCache = new Map<string, ReturnType<Row['cells']>>()
  const cell = (row: Row, col: CompareColumn) => {
    const k = `${row.key}|${col.schoolId}`
    if (!cellCache.has(k)) cellCache.set(k, row.cells(col))
    return cellCache.get(k)!
  }
  const isDiff = (row: Row) => new Set(cols.map((c) => cell(row, c).text)).size > 1
  let visible = rows
  if (interestOnly) visible = visible.filter((x) => x.group === '관심 과목' || x.group === '기준')
  const hiddenByDiff = diffOnly ? visible.filter((x) => !isDiff(x)).length : 0
  if (diffOnly) visible = visible.filter(isDiff)
  const groups = [...new Set(visible.map((x) => x.group))]
  const move = (i: number, dir: -1 | 1) => { const ids = [...state.compare]; const j = i + dir; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j]!, ids[i]!]; dispatch({ type: 'compare.set', ids }) }
  const exportCsv = () => {
    const head = ['항목', ...cols.map((c) => `${c.school!.officialName} (${state.cohortYear} 입학생)`)]
    const body = rows.map((row) => [row.label, ...cols.map((c) => cell(row, c).text)])
    downloadBlob(`compare-${state.cohortYear}.csv`, toCsv([head, ...body]), 'text/csv;charset=utf-8')
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>학교 비교</h1>
          <div className="sub">{state.cohortYear} 입학생 기준 · {cols.length}개교 · 종합점수나 서열을 만들지 않습니다.</div>
        </div>
        <div className="toolbar no-print">
          <label className="check"><input type="checkbox" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} /> 차이만 보기</label>
          <label className="check"><input type="checkbox" checked={interestOnly} onChange={(e) => setInterestOnly(e.target.checked)} /> 관심 과목만</label>
          <Button size="sm" onClick={exportCsv}>CSV</Button>
          <Button size="sm" onClick={() => window.print()}>인쇄</Button>
        </div>
      </div>
      {d.comparability.curriculumComparableCount < cols.length && <div className="hint warn">{d.comparability.note} 자료가 미확인인 학교도 비교표에서 없애지 않습니다.</div>}
      {diffOnly && hiddenByDiff > 0 && <p className="small muted">차이만 보기: 값이 같은 항목 {hiddenByDiff}개를 숨겼습니다 (미확인끼리 같아도 숨겨질 수 있습니다).</p>}
      {state.interestCourses.length === 0 && <p className="small muted">관심 과목이 없습니다. 교육과정 화면 또는 상담 워크스페이스에서 지정하면 편성 여부·학기·선택군 제한이 비교됩니다.</p>}

      {/* 데스크톱: 고정 헤더·항목 열 */}
      <div className="table-wrap compare-table-desktop">
        <table className="data compare-table">
          <caption>비교 기준: {state.cohortYear} 입학생{Object.values(state.trackChoice).some(Boolean) ? ' · 과정 선택 적용' : ''}. 서로 다른 입학생 자료는 자동 병합하지 않습니다.</caption>
          <thead>
            <tr>
              <th scope="col">항목</th>
              {cols.map((c, i) => (
                <th key={c.schoolId} scope="col" className="school-head">
                  <Link to={`/schools/${c.schoolId}`}>{c.school!.officialName}</Link>{c.school!.isSynthetic && <> <SyntheticBadge /></>}
                  <span className="basis">{state.cohortYear} 입학생{c.curriculum?.trackId ? ` · ${c.school!.tracks.find((t) => t.id === c.curriculum!.trackId)?.name ?? '과정'}` : ''} · {c.curriculum?.status === 'available' ? '공개 자료' : '자료 미확인'}</span>
                  <span className="no-print" style={{ display: 'flex', gap: 2, marginTop: 4 }}>
                    <Button size="sm" variant="quiet" onClick={() => move(i, -1)} disabled={i === 0} aria-label="왼쪽으로">‹</Button>
                    <Button size="sm" variant="quiet" onClick={() => move(i, 1)} disabled={i === cols.length - 1} aria-label="오른쪽으로">›</Button>
                    <Button size="sm" variant="quiet" onClick={() => dispatch({ type: 'compare.remove', id: c.schoolId })} aria-label="교체(제거)">×</Button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g} group={g} rows={visible.filter((x) => x.group === g)} cols={cols} cell={cell} isDiff={isDiff} collapsed={collapsed.has(g)} onToggle={() => setCollapsed((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n })} important={important} onImportant={(k) => setImportant((im) => (im.includes(k) ? im.filter((x) => x !== k) : [...im, k]))} />
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일: 한 학교씩 카드 + 항목 고정 */}
      <div className="compare-cards">
        <div className="toolbar">
          <Button size="sm" onClick={() => setMobileIdx((i) => Math.max(0, i - 1))} disabled={mobileIdx === 0}>‹ 이전</Button>
          <strong>{cols[mobileIdx]?.school?.officialName}</strong> <span className="small muted">{mobileIdx + 1}/{cols.length}</span>
          <Button size="sm" onClick={() => setMobileIdx((i) => Math.min(cols.length - 1, i + 1))} disabled={mobileIdx >= cols.length - 1}>다음 ›</Button>
        </div>
        {cols[mobileIdx] && (
          <div className="card">
            <div className="source">{state.cohortYear} 입학생 기준 · {cols[mobileIdx]!.curriculum?.status === 'available' ? '공개 자료' : '자료 미확인'}</div>
            <dl className="brief kv" style={{ gridTemplateColumns: '120px 1fr', border: 0 }}>
              {visible.map((row) => { const c = cell(row, cols[mobileIdx]!); return <FragmentRow key={row.key} label={row.label} diff={isDiff(row)}>{c.node ?? c.text}</FragmentRow> })}
            </dl>
          </div>
        )}
      </div>

      {important.length > 0 && (
        <section style={{ marginTop: 18 }}>
          <h2>중요 조건 대조표</h2>
          <p className="small muted">사용자가 표시한 조건을 '확인됨 / 조건부 / 미확인 / 조건과 다름'으로 대조합니다. 모르는 항목은 0점이 아니라 미확인입니다.</p>
          <div className="table-wrap">
            <table className="data cond-table">
              <thead><tr><th scope="col">조건</th>{cols.map((c) => <th key={c.schoolId} scope="col">{c.school!.officialName}</th>)}</tr></thead>
              <tbody>
                {rows.filter((x) => important.includes(x.key)).map((row) => (
                  <tr key={row.key}><th scope="row">{row.label}</th>{cols.map((c) => { const v = cell(row, c); const st = v.status ?? 'unknown'; return <td key={c.schoolId} className={`c-${st}`}><Tone tone={st === 'ok' ? 'ok' : st === 'cond' ? 'warn' : st === 'bad' ? 'bad' : 'unknown'}>{st === 'ok' ? '확인됨' : st === 'cond' ? '조건부' : st === 'bad' ? '조건과 다름' : '미확인'}</Tone><span className="cellnote">{v.text}</span></td> })}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Interpretation>규칙 충돌이 없다는 결과는 실제 개설이나 수강 확정을 뜻하지 않습니다. 공시 지표는 같은 연도·정의일 때만 나란히 읽으세요.</Interpretation>
    </>
  )
}

function FragmentRow({ label, diff, children }: { label: string; diff: boolean; children: ReactNode }) {
  return (
    <>
      <dt>{label}{diff && <span className="cellnote">차이</span>}</dt>
      <dd>{children}</dd>
    </>
  )
}

function GroupRows({ group, rows, cols, cell, isDiff, collapsed, onToggle, important, onImportant }: { group: string; rows: Row[]; cols: CompareColumn[]; cell: (r: Row, c: CompareColumn) => { text: string; node?: ReactNode }; isDiff: (r: Row) => boolean; collapsed: boolean; onToggle: () => void; important: string[]; onImportant: (k: string) => void }) {
  return (
    <>
      <tr>
        <th scope="row" colSpan={cols.length + 1} style={{ background: '#f0f2ec' }}>
          <button type="button" className="sortbtn" onClick={onToggle} aria-expanded={!collapsed}>{collapsed ? '▸' : '▾'} {group} <span className="muted small">({rows.length})</span></button>
        </th>
      </tr>
      {!collapsed && rows.map((row) => (
        <tr key={row.key} className={isDiff(row) ? 'diff' : ''}>
          <th scope="row">
            {row.label}
            {isDiff(row) && <span className="cellnote">차이 있음</span>}
            <label className="check small no-print" style={{ marginTop: 4 }}><input type="checkbox" checked={important.includes(row.key)} onChange={() => onImportant(row.key)} /> 중요 조건</label>
          </th>
          {cols.map((c) => { const v = cell(row, c); return <td key={c.schoolId}>{v.node ?? v.text}</td> })}
        </tr>
      ))}
    </>
  )
}
