import { useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useWorkspace, useEvidence } from '../lib/store'
import { useAsync, useDocumentTitle } from '../lib/hooks'
import { apiGet } from '../lib/api'
import type { ProfileResponse } from '../lib/types'
import { Button, Empty, ErrorBox, EvidenceButton, Interpretation, Skeleton, StatusBadge, SyntheticBadge, Tone } from '../components/ui'
import { DOCUMENT_TYPE_LABEL, ESTABLISHMENT_LABEL, GENDER_LABEL, SELECTION_AUTHORITY_LABEL, schoolTypeDisplay, type CurriculumLookup, type Fact } from '@shared/types'
import { formatCalendarDate, formatDateKo } from '@shared/format'
import { MAX_COMPARE_SCHOOLS } from '@shared/constants'

const TABS = [
  ['overview', '개요'],
  ['curriculum', '교육과정'],
  ['admission', '입학·일정'],
  ['life', '학교생활·지원'],
  ['stats', '공시 지표'],
  ['sources', '원문·변경 이력'],
] as const

const FIELD_LABEL: Record<string, string> = { 'students.total': '학생 수', 'classes.total': '학급 수', 'teachers.total': '교원 수', 'dormitory.capacity': '기숙사 수용', 'transfer.in': '전입', 'transfer.out': '전출', 'graduates.path': '졸업 후 진로' }
const KIND_LABEL: Record<string, string> = { club: '동아리', program: '특색사업', facility: '시설', dormitory: '기숙사', meal: '급식', scholarship: '장학', counseling: '상담', support: '지원', other: '기타' }
const PHASE_LABEL: Record<string, string> = { plan: '계획', result: '운영 결과', promotion: '홍보 소개', unknown: '단계 미확인' }

export default function SchoolProfile() {
  const { id = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const tab = sp.get('tab') ?? 'overview'
  const { state, dispatch } = useWorkspace()
  const { open } = useEvidence()
  const r = useAsync(() => apiGet<ProfileResponse>(`/api/schools/${encodeURIComponent(id)}`), id)
  const look = useAsync(() => apiGet<CurriculumLookup>(`/api/schools/${encodeURIComponent(id)}/curricula?cohortYear=${state.cohortYear}${state.trackChoice[id] ? `&trackId=${encodeURIComponent(state.trackChoice[id]!)}` : ''}`), `${id}-${state.cohortYear}-${state.trackChoice[id] ?? ''}`)
  useDocumentTitle(r.data?.school.officialName ?? '학교')
  const d = r.data
  const interestHits = useMemo(() => {
    const b = look.data?.bundle
    if (!b) return []
    const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
    return state.interestCourses.map((c) => ({ name: c, offerings: b.offerings.filter((o) => norm(o.courseOriginalName) === norm(c)) }))
  }, [look.data, state.interestCourses])

  if (r.loading) return <Skeleton lines={8} />
  if (r.error) return <ErrorBox error={r.error} retry={r.reload} />
  if (!d) return null
  const s = d.school
  const inCompare = state.compare.includes(s.id)
  const unknownCount = [s.schoolType === 'unknown', s.establishment === 'unknown', s.gender === 'unknown', !s.geo, !s.homepage].filter(Boolean).length
  const rule = d.admissionRules.find((x) => x.admissionYear === state.cohortYear && x.status === 'published')

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{s.district} · {schoolTypeDisplay(s)}</div>
          <h1 style={{ marginTop: 4 }}>{s.officialName} {s.isSynthetic && <SyntheticBadge />}</h1>
          <div className="sub">
            {ESTABLISHMENT_LABEL[s.establishment]} · {GENDER_LABEL[s.gender]} · {s.address ?? '주소 미확인'}
            {s.homepage && <> · <a href={s.homepage} target="_blank" rel="noreferrer noopener">공식 홈페이지 ↗</a></>}
          </div>
        </div>
        <div className="toolbar">
          <Button variant={inCompare ? 'primary' : 'secondary'} aria-pressed={inCompare} disabled={!inCompare && state.compare.length >= MAX_COMPARE_SCHOOLS} onClick={() => dispatch(inCompare ? { type: 'compare.remove', id: s.id } : { type: 'compare.add', id: s.id })}>{inCompare ? '비교 중' : '비교 담기'}</Button>
          <Link className="btn secondary" to={`/schools/${s.id}/curriculum`}>교육과정 보기</Link>
          <Button variant="quiet" onClick={() => nav(-1)}>← 검색으로</Button>
        </div>
      </div>

      {/* 30초 요약 */}
      <section className="card" aria-labelledby="sum-h">
        <h3 id="sum-h">30초 요약 — {state.cohortYear} 입학생 기준</h3>
        <div className="summary-strip" style={{ margin: '8px 0' }}>
          <div className="item"><div className="k">선발 방식</div><div className="v text">{rule ? SELECTION_AUTHORITY_LABEL[rule.selectionAuthority] : '해당 연도 규정 미확인'}</div></div>
          <div className="item"><div className="k">교육과정 자료</div><div className="v text"><LookupBadge l={look.data} /></div></div>
          <div className="item"><div className="k">관심 과목</div><div className="v text">{state.interestCourses.length === 0 ? '관심 과목 미지정' : look.data?.bundle ? `${interestHits.filter((h) => h.offerings.length > 0).length}/${state.interestCourses.length} 편성 확인` : '자료 없어 확인 불가'}</div></div>
          <div className="item"><div className="k">기본정보 미확인 항목</div><div className="v">{unknownCount}</div></div>
        </div>
        {interestHits.length > 0 && look.data?.bundle && (
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {interestHits.map((h) => (
              <li key={h.name} className="small">
                <strong>{h.name}</strong>: {h.offerings.length === 0 ? <StatusBadge status="confirmed_absent" label="이 자료에 없음" /> : h.offerings.map((o) => `${o.grade}학년 ${o.semester}학기 ${o.creditValue ?? '?'}${o.creditUnit === 'unit' ? '단위' : '학점'} ${o.requirementType === 'school_designated' ? '지정' : o.selectionGroupId ? `선택(${look.data!.bundle!.selectionGroups.find((g) => g.id === o.selectionGroupId)?.label ?? '선택군'})` : '선택(규칙 미확인)'}`).join(' · ')}
              </li>
            ))}
          </ul>
        )}
        <p className="source" style={{ marginTop: 8 }}>자료 기준: 기본정보 수집 {s.retrievedAt ? formatDateKo(s.retrievedAt) : '미확인'} · 학교명만으로 유형·과목·시설을 추측하지 않습니다.</p>
      </section>

      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => { const n = new URLSearchParams(sp); n.set('tab', k); setSp(n, { replace: true }) }}>{l}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid-2">
          <div className="card">
            <h3>기본 정보</h3>
            <dl className="brief kv" style={{ border: 0 }}>
              <dt>공식명</dt><dd>{s.officialName}{s.shortName ? ` (${s.shortName})` : ''}</dd>
              <dt>별칭</dt><dd>{s.aliases.length ? s.aliases.join(', ') : '승인된 별칭 없음'}</dd>
              <dt>유형</dt><dd>{schoolTypeDisplay(s)} <StatusBadge status={s.schoolTypeStatus} />{s.schoolSubtype && <span className="cellnote">세부 구분 원문: {s.schoolSubtype}</span>}{s.sourceConflicts.filter((c) => c.field === 'schoolType').map((c) => <span key={c.field} className="cellnote">제공처 값이 다릅니다 — {c.values.map((v) => `${v.provider === 'schoolinfo' ? '학교알리미' : v.provider === 'neis' ? '나이스' : v.provider}: ${v.value}`).join(' / ')}. 어느 쪽이 최신인지 확인 전까지 임의로 고르지 않습니다.</span>)}</dd>
              <dt>설립 / 공학</dt><dd>{ESTABLISHMENT_LABEL[s.establishment]} / {GENDER_LABEL[s.gender]}{s.sourceConflicts.filter((c) => c.field === 'gender').map((c) => <span key={c.field} className="cellnote"><StatusBadge status="conflict" /> {c.values.map((v) => `${v.provider === 'schoolinfo' ? '학교알리미' : '나이스'}: ${v.value}`).join(' / ')}</span>)}</dd>
              <dt>운영 상태</dt><dd>{s.operatingStatus === 'operating' ? '운영 중' : s.operatingStatus === 'unknown' ? '미확인' : s.operatingStatus}</dd>
              <dt>학과·과정</dt><dd>{s.tracks.length ? s.tracks.map((t) => `${t.name}`).join(', ') : '검토된 학과·과정 없음'}</dd>
              <dt>좌표</dt><dd>{s.geo ? `${s.geo.lat}, ${s.geo.lng} (출처 ${s.geo.source})` : '좌표 없음 (목록·비교에는 포함)'}</dd>
              <dt>제공처 코드</dt><dd>{s.codes.length ? s.codes.map((c) => `${c.provider}:${c.code}${c.status === 'pending' ? ' (매핑 검토 대기)' : ''}`).join(' · ') : '없음'}</dd>
            </dl>
          </div>
          <div className="card">
            <h3>자료 상태</h3>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              <li>교육과정 공개 버전: {d.curriculumVersions.length ? d.curriculumVersions.map((v) => `${v.cohortYear} 입학생${v.trackId ? ` (${s.tracks.find((t) => t.id === v.trackId)?.name ?? '과정'})` : ''}`).join(', ') : '없음'}</li>
              <li>검토 대기 버전: {d.draftVersionCount}건 (공개 전까지 비교·경로 검토에 쓰지 않음)</li>
              <li>승인된 원문 문서: {d.documents.length}건</li>
              <li>입학 규정: {d.admissionRules.length ? d.admissionRules.map((x) => `${x.admissionYear} ${x.title}`).join(' / ') : '등록된 규정 없음'}</li>
            </ul>
            <Interpretation>자료가 없다는 표시는 과목·시설이 없다는 뜻이 아닙니다. 학교에 확인할 질문으로 남기세요.</Interpretation>
          </div>
        </div>
      )}

      {tab === 'curriculum' && (
        <div className="card">
          <h3>{state.cohortYear} 입학생 교육과정</h3>
          <p className="lead"><LookupBadge l={look.data} /> {look.data?.message}</p>
          {look.data?.status === 'track_required' && (
            <div className="field">
              <label htmlFor="track-sel">과정 선택</label>
              <select id="track-sel" className="select" style={{ maxWidth: 320 }} value={state.trackChoice[s.id] ?? ''} onChange={(e) => dispatch({ type: 'track.set', schoolId: s.id, trackId: e.target.value || null })}>
                <option value="">선택하세요</option>
                {look.data.availableTracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div className="toolbar">
            <Link className="btn primary" to={`/schools/${s.id}/curriculum`}>6학기 매트릭스·선택군 열기</Link>
            {look.data?.referenceOnly.length ? <span className="small muted">다른 입학연도 참고 자료 {look.data.referenceOnly.length}건은 매트릭스 화면의 참고 패널에서만 열립니다.</span> : null}
          </div>
        </div>
      )}

      {tab === 'admission' && (
        <div className="card">
          <h3>입학 전형·일정</h3>
          {d.admissionRules.length === 0 ? (
            <Empty title="등록된 입학 규정이 없습니다">교육청 기본계획·변경 공고·학교 모집요강을 등록한 뒤 해당 연도의 근거와 함께 표시됩니다.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption>규정은 버전으로 관리됩니다. 변경본이 있으면 이전 버전은 '대체됨'으로 남습니다.</caption>
                <thead><tr><th scope="col">입학연도</th><th scope="col">규정</th><th scope="col">선발 주체</th><th scope="col">조건</th><th scope="col">버전</th><th scope="col">근거</th></tr></thead>
                <tbody>
                  {d.admissionRules.map((x) => (
                    <tr key={x.id}>
                      <td>{x.admissionYear}</td>
                      <td>{x.title}{x.round ? ` (${x.round})` : ''}</td>
                      <td>{SELECTION_AUTHORITY_LABEL[x.selectionAuthority]}</td>
                      <td>{x.eligibilityConditions.map((c) => <div key={c.label} className="small"><StatusBadge status={c.status} label={c.label} /> {c.detail ?? ''}</div>)}</td>
                      <td>v{x.version} {x.status === 'superseded' ? <Tone tone="info">대체됨</Tone> : <Tone tone="ok">유효</Tone>}</td>
                      <td><EvidenceButton ids={x.evidenceIds} onOpen={open} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3 style={{ marginTop: 16 }}>일정 (Asia/Seoul)</h3>
          {d.admissionEvents.length === 0 ? <p className="muted">등록된 일정이 없습니다.</p> : (
            <ul style={{ paddingLeft: 18 }}>
              {d.admissionEvents.map((e) => (
                <li key={e.id}>
                  {formatCalendarDate(e.date)}{e.endDate ? ` ~ ${formatCalendarDate(e.endDate)}` : ''}{e.allDay || !e.time ? ' (종일)' : ` ${e.time}`} · {e.title} {e.status === 'revised' ? <Tone tone="info">변경 전</Tone> : e.status === 'unconfirmed' ? <Tone tone="unknown">미확인</Tone> : <Tone tone="ok">확인 {e.confirmedAt ? formatDateKo(e.confirmedAt) : ''}</Tone>} <EvidenceButton ids={e.evidenceIds} onOpen={open} />
                </li>
              ))}
            </ul>
          )}
          <Interpretation>일정이 지났다고 발표가 완료되었다고 추정하지 않습니다. 중복지원·합격 후 지원 가능 여부는 검토된 공식 규정이 있을 때만 설명합니다.</Interpretation>
        </div>
      )}

      {tab === 'life' && (
        <div className="card">
          <h3>학교생활·지원 — 실제 확인한 것만</h3>
          {d.programs.length === 0 ? <Empty title="확인된 항목이 없습니다">동아리·특색사업·시설·기숙사·급식·장학·상담 자료가 아직 수집·검토되지 않았습니다. 없다는 뜻이 아닙니다.</Empty> : (
            <div className="table-wrap">
              <table className="data">
                <caption>계획 / 운영 결과 / 홍보 소개를 구분합니다. 같은 이름의 동아리가 매년 운영된다고 가정하지 않습니다.</caption>
                <thead><tr><th scope="col">항목</th><th scope="col">구분</th><th scope="col">단계</th><th scope="col">기준 연도</th><th scope="col">사용 가능·조건</th><th scope="col">상태</th><th scope="col">근거</th></tr></thead>
                <tbody>
                  {d.programs.map((p) => (
                    <tr key={p.id}><th scope="row">{p.name}</th><td>{KIND_LABEL[p.kind]}</td><td>{PHASE_LABEL[p.phase]}</td><td>{p.basisYear ?? '미확인'}</td><td>{p.availability ?? '미확인'}</td><td><StatusBadge status={p.status} /></td><td><EvidenceButton ids={p.evidenceIds} onOpen={open} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'stats' && <StatsTab facts={d.facts} />}

      {tab === 'sources' && (
        <div className="card">
          <h3>원문·변경 이력</h3>
          {d.documents.length === 0 ? <Empty title="승인된 원문이 없습니다" /> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th scope="col">문서</th><th scope="col">종류</th><th scope="col">발행</th><th scope="col">게시일</th><th scope="col">적용 학년도 / 대상 입학생</th><th scope="col">수집일</th><th scope="col">상태</th><th scope="col">원문</th></tr></thead>
                <tbody>
                  {d.documents.map((doc) => (
                    <tr key={doc.id}>
                      <th scope="row">{doc.title}</th>
                      <td>{DOCUMENT_TYPE_LABEL[doc.documentType]}</td>
                      <td>{doc.publisher}</td>
                      <td>{doc.publishedAt ? formatDateKo(doc.publishedAt) : '미확인'}</td>
                      <td>{doc.applicableAcademicYear ?? '—'} / {doc.cohortYear ?? '—'}</td>
                      <td>{doc.retrievedAt ? formatDateKo(doc.retrievedAt) : '미수집'}</td>
                      <td>{doc.reviewStatus === 'superseded' ? <Tone tone="info">대체됨 (v{doc.version})</Tone> : <Tone tone="ok">검토 완료 (v{doc.version})</Tone>}{doc.supersedesId && <span className="cellnote">이전 버전을 대체</span>}</td>
                      <td>{doc.officialUrl ? <a href={doc.officialUrl} target="_blank" rel="noreferrer noopener">열기 ↗</a> : <span className="muted small">링크 없음</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="source" style={{ marginTop: 10 }}>교육과정 버전 간 변경 비교는 교육과정 화면의 '변경 이력'에서 같은 입학연도·개정·과정끼리만 수행합니다.</p>
        </div>
      )}
    </>
  )
}

function LookupBadge({ l }: { l: CurriculumLookup | null }) {
  if (!l) return <Tone tone="unknown">확인 중</Tone>
  switch (l.status) {
    case 'available':
      return <Tone tone="ok">{l.bundle?.version.reviewStatus === 'approved' ? '검토 완료 공개' : '공개'}</Tone>
    case 'unreviewed_only':
      return <Tone tone="warn">검토 대기</Tone>
    case 'track_required':
      return <Tone tone="info">과정 선택 필요</Tone>
    case 'cohort_not_available':
      return <Tone tone="unknown">해당 입학생 자료 미확인</Tone>
    default:
      return <Tone tone="unknown">미수집</Tone>
  }
}

function StatsTab({ facts }: { facts: Fact[] }) {
  const { open } = useEvidence()
  const fields = [...new Set(facts.map((f) => f.field))]
  if (facts.length === 0) return <Empty title="공시 지표가 없습니다">학교알리미 공시 항목을 수집·검토하면 기준 연도·정의·분모와 함께 표시됩니다.</Empty>
  return (
    <div className="card">
      <h3>공시 지표 — 기준 연도·정의·분모와 함께</h3>
      <div className="table-wrap">
        <table className="data">
          <caption>0 과 미공개를 구분합니다. 같은 연도·정의가 아니면 비교 불가로 표시합니다. 진학률을 특정 대학 합격률로 바꾸지 않습니다.</caption>
          <thead><tr><th scope="col">지표</th><th scope="col">값</th><th scope="col">기준 연도</th><th scope="col">정의</th><th scope="col">상태</th><th scope="col">근거</th></tr></thead>
          <tbody>
            {fields.map((field) => {
              const rows = facts.filter((f) => f.field === field).sort((a, b) => (b.basisYear ?? 0) - (a.basisYear ?? 0))
              return rows.map((f, i) => (
                <tr key={f.id}>
                  {i === 0 && <th scope="row" rowSpan={rows.length}>{FIELD_LABEL[field] ?? field}</th>}
                  <td className="num">{f.status === 'confirmed' ? `${typeof f.value === 'number' ? f.value.toLocaleString() : String(f.value)}${f.unit ?? ''}` : '—'}</td>
                  <td>{f.basisYear ?? '미확인'}</td>
                  <td className="small">{f.definition ?? '미확인'}{f.derivation ? ` · 계산: ${f.derivation}` : ''}</td>
                  <td><StatusBadge status={f.status} />{f.reviewerNote && <span className="cellnote">{f.reviewerNote}</span>}</td>
                  <td><EvidenceButton ids={f.evidenceIds} onOpen={open} /></td>
                </tr>
              ))
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
