import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../lib/store'
import { useDocumentTitle } from '../lib/hooks'
import { apiGet, apiPost } from '../lib/api'
import type { CompareResponse } from '../lib/types'
import type { AdmissionEvent, SourceDocument } from '@shared/types'
import { Button, Empty, Interpretation, StatusBadge } from '../components/ui'
import { downloadBlob, toCsv, toIcs, exportSession } from '../lib/export'
import { SCHOOL_TYPE_LABEL, SELECTION_AUTHORITY_LABEL } from '@shared/types'
import { formatCalendarDate, formatDateKo } from '@shared/format'

export default function Briefing() {
  useDocumentTitle('상담 브리핑')
  const { state } = useWorkspace()
  const s = state.session
  const [cmp, setCmp] = useState<CompareResponse | null>(null)
  const [docs, setDocs] = useState<SourceDocument[]>([])
  const [opts, setOpts] = useState({ appendixCurriculum: true, appendixEvents: true, includePrivate: false, includeCommute: true })
  const [pickedEvents, setPickedEvents] = useState<Set<string>>(new Set())
  const ids = s?.candidateSchoolIds ?? state.compare
  const cohort = s?.targetCohortYear ?? state.cohortYear
  const interest = s?.interestCourses?.length ? s.interestCourses : state.interestCourses

  useEffect(() => {
    if (ids.length === 0) return
    apiPost<CompareResponse>('/api/compare', { schoolIds: ids, cohortYear: cohort, trackIds: Object.fromEntries(ids.map((id) => [id, state.trackChoice[id] ?? null])), interestCourses: interest })
      .then(async (c) => {
        setCmp(c)
        const docIds = [...new Set(c.columns.flatMap((col) => col.curriculum?.documentIds ?? []))]
        const loaded = await Promise.all(docIds.map((d) => apiGet<{ document: SourceDocument }>(`/api/documents/${encodeURIComponent(d)}`).then((x) => x.document).catch(() => null)))
        setDocs(loaded.filter((x): x is SourceDocument => Boolean(x)))
      })
      .catch(() => setCmp(null))
  }, [ids.join(','), cohort, interest.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (ids.length === 0) return <Empty title="브리핑할 후보 학교가 없습니다" actions={<><Link className="btn primary" to="/counsel">상담 워크스페이스</Link><Link className="btn secondary" to="/schools">학교 찾기</Link></>}>상담의 후보 학교 또는 비교 바구니를 기준으로 1쪽 요약과 선택한 부록을 만듭니다.</Empty>
  const cols = cmp?.columns.filter((c) => c.status === 'ok') ?? []
  // 교육청 공통 일정(school_id 없음)은 여러 학교 열에 중복되므로 id 로 한 번만 남긴다.
  const events: (AdmissionEvent & { sourceTitle?: string })[] = [...new Map(cols.flatMap((c) => c.admissionEvents.map((e) => [e.id, { ...e, sourceTitle: e.schoolId ? `${c.school!.officialName} 입학 규정` : '교육청 공통 규정' }] as const))).values()]
  const generatedAt = new Date().toISOString()
  const remaining: string[] = s?.checklist.filter((c) => !c.done).map((c) => c.text) ?? []
  for (const col of cols) {
    const name = col.school!.officialName
    if (col.curriculum && col.curriculum.status !== 'available') remaining.push(`${name}: ${cohort} 입학생 편제표 공개 여부 확인`)
    for (const it of col.interest) if (it.status === 'unknown') remaining.push(`${name}: '${it.name}' 편성 여부 확인`)
    for (const it of col.interest) for (const g of it.groups) if (g.ruleStatus !== 'verified') remaining.push(`${name}: ${g.label} 의 동시 선택 가능 여부 확인`)
  }
  const diffs: string[] = []
  if (cols.length >= 2) {
    for (const name of interest) {
      const statuses = cols.map((c) => c.interest.find((i) => i.name === name)?.status ?? 'unknown')
      if (new Set(statuses).size > 1) diffs.push(`'${name}': ${cols.map((c, i) => `${c.school!.officialName} ${statuses[i] === 'confirmed' ? '편성 확인' : statuses[i] === 'confirmed_absent' ? '자료에 없음' : '미확인'}`).join(' / ')}`)
      const rules = cols.map((c) => c.interest.find((i) => i.name === name)?.groups.map((g) => `${g.label} ${g.ruleStatus === 'verified' ? `${g.minSelections ?? '?'}~${g.maxSelections ?? '?'}` : '미확인'}`).join(',') ?? '')
      if (new Set(rules).size > 1 && rules.some(Boolean)) diffs.push(`'${name}' 선택 조건: ${cols.map((c, i) => `${c.school!.officialName} ${rules[i] || '해당 없음'}`).join(' / ')}`)
    }
    const auth = cols.map((c) => c.admissionRules[0]?.selectionAuthority ?? 'unknown')
    if (new Set(auth).size > 1) diffs.push(`선발 방식: ${cols.map((c, i) => `${c.school!.officialName} ${SELECTION_AUTHORITY_LABEL[auth[i]!]}`).join(' / ')}`)
  }

  const csv = () => downloadBlob(`briefing-${cohort}.csv`, toCsv([['학교', '유형', '자료 상태', ...interest.map((i) => `관심: ${i}`)], ...cols.map((c) => [c.school!.officialName, SCHOOL_TYPE_LABEL[c.school!.schoolType], c.curriculum?.status ?? '', ...interest.map((i) => c.interest.find((x) => x.name === i)?.status ?? '')])]), 'text/csv;charset=utf-8')
  const ics = () => downloadBlob(`events-${cohort}.ics`, toIcs(events.filter((e) => pickedEvents.has(e.id))), 'text/calendar;charset=utf-8')

  return (
    <>
      <div className="page-head no-print">
        <div><h1>상담 브리핑</h1><div className="sub">1쪽 요약 + 선택한 부록. 개인 메모·정확한 주소는 기본 출력에서 제외됩니다.</div></div>
        <div className="toolbar">
          <label className="check"><input type="checkbox" checked={opts.appendixCurriculum} onChange={(e) => setOpts({ ...opts, appendixCurriculum: e.target.checked })} /> 부록: 교육과정 상세</label>
          <label className="check"><input type="checkbox" checked={opts.appendixEvents} onChange={(e) => setOpts({ ...opts, appendixEvents: e.target.checked })} /> 부록: 일정</label>
          <label className="check"><input type="checkbox" checked={opts.includeCommute} onChange={(e) => setOpts({ ...opts, includeCommute: e.target.checked })} /> 사용자 확인 통학 포함</label>
          <label className="check"><input type="checkbox" checked={opts.includePrivate} onChange={(e) => setOpts({ ...opts, includePrivate: e.target.checked })} /> 비공개 메모 포함</label>
          <Button variant="primary" onClick={() => window.print()}>인쇄 / PDF 저장</Button>
          <Button onClick={csv}>CSV 비교</Button>
          {s && <Button onClick={() => downloadBlob(`counsel-${s.alias || s.id}.json`, JSON.stringify(exportSession(s, { includePrivateNotes: opts.includePrivate }), null, 2), 'application/json')}>JSON 백업</Button>}
          <Button onClick={() => { const url = `${location.origin}/compare?schools=${ids.join(',')}&cohort=${cohort}`; navigator.clipboard?.writeText(url); alert('공개 비교 링크를 복사했습니다 (학교 ID·입학연도만 포함, 학생 정보 없음).') }}>공유 링크</Button>
        </div>
      </div>

      <article className="brief">
        <div className="cover" style={{ backgroundImage: 'image-set(url(/images/briefing-cover-1200.avif) type("image/avif"), url(/images/briefing-cover-1200.webp) type("image/webp"))' }}>
          <div><div className="eyebrow">COUNSELING BRIEF</div><h1 style={{ fontSize: 24 }}>{s?.alias ? `${s.alias} 상담 브리핑` : '상담 브리핑'}</h1><div className="small muted">{cohort} 입학생 기준 · 생성 {formatDateKo(generatedAt, { withTime: true })}</div></div>
        </div>
        <div className="body">
          <section>
            <h2>1. 상담 기준</h2>
            <dl className="kv">
              <dt>대상 입학연도</dt><dd>{cohort}</dd>
              <dt>관심 분야</dt><dd>{s?.interests.join(', ') || '미기록'}</dd>
              <dt>학생이 중요하게 본 조건</dt><dd>{[...(s?.lifePreferences ?? []), s?.commutePriority ? `통학 우선순위 ${s.commutePriority}` : ''].filter(Boolean).join(', ') || '미기록'}</dd>
              <dt>관심 과목</dt><dd>{interest.join(', ') || '미지정'}</dd>
            </dl>
          </section>
          <section>
            <h2>2. 후보 학교 비교 (확인된 사실)</h2>
            <div className="table-wrap" style={{ maxHeight: 'none' }}>
              <table className="data">
                <thead><tr><th scope="col">학교</th><th scope="col">유형·선발</th><th scope="col">{cohort} 교육과정 자료</th>{interest.map((i) => <th key={i} scope="col">{i}</th>)}{opts.includeCommute && <th scope="col">사용자 확인 통학</th>}</tr></thead>
                <tbody>
                  {cols.map((c) => {
                    const uc = s?.userCommutes.find((u) => u.schoolId === c.schoolId)
                    return (
                      <tr key={c.schoolId}>
                        <th scope="row">{c.school!.officialName}{c.school!.isSynthetic ? ' (가상)' : ''}</th>
                        <td>{SCHOOL_TYPE_LABEL[c.school!.schoolType]} · {c.admissionRules[0] ? SELECTION_AUTHORITY_LABEL[c.admissionRules[0].selectionAuthority] : '규정 미확인'}</td>
                        <td>{c.curriculum?.status === 'available' ? `공개 (${c.curriculum.reviewStatus === 'approved' ? '검토 완료' : '검토 미확인'})` : c.curriculum?.message ?? '미확인'}</td>
                        {interest.map((i) => { const it = c.interest.find((x) => x.name === i); return <td key={i}>{!it ? '—' : it.status === 'confirmed' ? `편성 ${it.offerings.map((o) => `${o.grade}-${o.semester} ${o.creditValue ?? '?'}`).join(', ')}${it.groups.length ? ` / ${it.groups.map((g) => `${g.label} ${g.ruleStatus === 'verified' ? `${g.minSelections ?? '?'}~${g.maxSelections ?? '?'}과목` : '규칙 미확인'}`).join(', ')}` : ''} (개설 미확인)` : it.status === 'confirmed_absent' ? '공개 자료에 없음' : '자료 미확인'}</td> })}
                        {opts.includeCommute && <td>{uc ? `${uc.mode} ${uc.minutes ?? '?'}분 (${uc.checkedOn ?? '확인일 미기록'})` : '미확인'}</td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h2>3. 확인된 차이</h2>
            {diffs.length === 0 ? <p className="muted">확인된 차이가 없거나 비교 가능한 자료가 부족합니다.</p> : <ul>{diffs.slice(0, 8).map((d) => <li key={d}>{d}</li>)}</ul>}
            {s?.sharedNotes && <Interpretation>{s.sharedNotes}</Interpretation>}
            {opts.includePrivate && s?.privateNotes && <div className="private-note"><strong>교사 비공개 메모 · </strong>{s.privateNotes}</div>}
          </section>
          <section>
            <h2>4. 남은 질문 (학교에 확인)</h2>
            {remaining.length === 0 ? <p className="muted">없음</p> : <ul>{[...new Set(remaining)].map((q) => <li key={q}>{q}</li>)}</ul>}
          </section>
          {opts.appendixEvents && (
            <section>
              <h2>5. 일정 (Asia/Seoul)</h2>
              {events.length === 0 ? <p className="muted">확인된 일정 없음</p> : (
                <ul>{events.map((e) => <li key={e.id}><label className="check no-print" style={{ display: 'inline-flex' }}><input type="checkbox" checked={pickedEvents.has(e.id)} onChange={() => setPickedEvents((p) => { const n = new Set(p); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n })} /></label> {formatCalendarDate(e.date)}{e.endDate ? `~${formatCalendarDate(e.endDate)}` : ''}{e.time ? ` ${e.time}` : ' (종일)'} · {e.title} · 확인 {e.confirmedAt ? formatDateKo(e.confirmedAt) : '미확인'}</li>)}</ul>
              )}
              <div className="no-print toolbar"><Button size="sm" onClick={ics} disabled={pickedEvents.size === 0}>선택 일정 ICS 내려받기</Button><span className="source">외부 캘린더로 자동 발송하지 않습니다.</span></div>
            </section>
          )}
          {opts.appendixCurriculum && (
            <section>
              <h2>6. 부록: 교육과정 상세</h2>
              {cols.map((c) => (
                <div key={c.schoolId} style={{ marginBottom: 10 }}>
                  <strong>{c.school!.officialName}</strong> — {c.curriculum?.status === 'available' ? `${c.curriculum.revision} 개정 · 편성 ${c.curriculum.offeringCount}과목 · 선택군 ${c.curriculum.groupCount}개 (규칙 미확인 ${c.curriculum.unverifiedGroupCount})` : c.curriculum?.message}
                  {c.interest.filter((i) => i.status === 'confirmed').map((i) => <div key={i.name} className="small">· {i.name}: {i.offerings.map((o) => `${o.grade}학년 ${o.semester}학기 ${o.creditValue ?? '학점 미확인'} ${o.requirementType === 'school_designated' ? '지정' : '선택'}`).join('; ')}{i.groups.map((g) => ` [${g.label}: ${g.verifiedRules.join(' / ') || g.unknownRules.join(' / ') || '규칙 미확인'}]`).join('')}</div>)}
                </div>
              ))}
            </section>
          )}
          <section>
            <h2>7. 출처·자료 기준 시점</h2>
            <ul>
              {docs.map((d) => <li key={d.id} className="small">{d.title} · {d.publisher} · 게시 {d.publishedAt ? formatDateKo(d.publishedAt) : '미확인'} · 수집 {d.retrievedAt ? formatDateKo(d.retrievedAt) : '미확인'} · 대상 {d.cohortYear ?? '—'} 입학생 · v{d.version} <StatusBadge status={d.reviewStatus === 'approved' ? 'confirmed' : 'unreviewed'} label={d.reviewStatus === 'approved' ? '검토 완료' : d.reviewStatus} /></li>)}
              {s?.dataVersions.map((v) => <li key={v.schoolId} className="small">상담에 사용한 교육과정 버전: {cols.find((c) => c.schoolId === v.schoolId)?.school?.officialName ?? v.schoolId} · {v.curriculumVersionId} · {v.cohortYear} 입학생 · 저장 {formatDateKo(v.capturedAt)}</li>)}
              {docs.length === 0 && (s?.dataVersions.length ?? 0) === 0 && <li className="muted">연결된 승인 원문이 없습니다.</li>}
            </ul>
            <p className="source">확인된 사실 / 학생의 선호 / 교사의 해석 / 학교에 확인할 질문을 구분해 기록했습니다. 규칙 충돌이 없다는 결과는 실제 개설·수강 확정을 뜻하지 않습니다. 학교 품질·합격 확률·배정 확률을 산출하지 않습니다.</p>
          </section>
        </div>
      </article>
    </>
  )
}
