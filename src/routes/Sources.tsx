import { useDocumentTitle, useAsync } from '../lib/hooks'
import { apiGet } from '../lib/api'
import type { SourcesResponse } from '../lib/types'
import { ErrorBox, Skeleton, SyntheticBadge, Tone } from '../components/ui'
import { DOCUMENT_TYPE_LABEL } from '@shared/types'
import { formatDateKo } from '@shared/format'
import registry from '../../data/provenance/source-registry.json'

export default function Sources() {
  useDocumentTitle('출처·자료 범위')
  const r = useAsync(() => apiGet<SourcesResponse>('/api/sources'), 'sources')
  if (r.loading) return <Skeleton lines={8} />
  if (r.error) return <ErrorBox error={r.error} retry={r.reload} />
  const d = r.data!
  const cov = d.coverage
  return (
    <>
      <div className="page-head"><div><h1>출처·자료 범위·갱신 상태</h1><div className="sub">모든 학교별 사실에는 출처와 기준 시점이 있습니다. 수집 성공 구/실패 구/자료 기준일을 확인합니다.</div></div></div>
      <div className="summary-strip">
        <div className="item"><div className="k">기본정보 학교 수 (가상 제외)</div><div className="v">{cov.schoolCount}</div></div>
        <div className="item"><div className="k">교육과정 공개 학교</div><div className="v">{cov.schoolsWithPublishedCurriculum}</div></div>
        <div className="item"><div className="k">검토 대기 학교</div><div className="v">{cov.schoolsWithUnreviewedCurriculum}</div></div>
        <div className="item"><div className="k">검토 대기 문서</div><div className="v">{d.pendingReviewCount}</div></div>
        <div className="item"><div className="k">가상 자료 (집계 제외)</div><div className="v">{cov.syntheticExcluded}</div></div>
        <div className="item"><div className="k">집계 시각</div><div className="v text">{formatDateKo(cov.generatedAt, { withTime: true })}</div></div>
      </div>
      <p className="source">{cov.dataBasisNote}</p>

      <section className="card">
        <h3>자치구별 수집 상태</h3>
        <div className="table-wrap" style={{ maxHeight: 420 }}>
          <table className="data">
            <thead><tr><th scope="col">자치구</th><th scope="col">코드</th><th scope="col">상태</th><th scope="col">학교 수</th><th scope="col">마지막 시도</th><th scope="col">오류</th></tr></thead>
            <tbody>
              {cov.districts.map((x) => (
                <tr key={x.district}><th scope="row">{x.district}</th><td>{x.districtCode ?? '—'}</td><td>{x.status === 'succeeded' ? <Tone tone="ok">성공</Tone> : x.status === 'failed' ? <Tone tone="bad">실패</Tone> : x.status === 'partial' ? <Tone tone="warn">부분</Tone> : <Tone tone="unknown">미시도</Tone>}</td><td className="num">{x.schoolCount}</td><td>{x.lastAttemptAt ? formatDateKo(x.lastAttemptAt, { withTime: true }) : '—'}</td><td className="small">{x.error ?? ''}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h3>승인된 원문 문서 ({d.documents.length})</h3>
        {d.documents.length === 0 ? <p className="muted">아직 승인된 문서가 없습니다.</p> : (
          <div className="table-wrap" style={{ maxHeight: 480 }}>
            <table className="data">
              <thead><tr><th scope="col">문서</th><th scope="col">종류</th><th scope="col">발행</th><th scope="col">게시일</th><th scope="col">적용/대상</th><th scope="col">수집일</th><th scope="col">권리</th><th scope="col">상태</th></tr></thead>
              <tbody>{d.documents.map((doc) => <tr key={doc.id}><th scope="row">{doc.title}{doc.isSynthetic && <> <SyntheticBadge /></>}</th><td>{DOCUMENT_TYPE_LABEL[doc.documentType]}</td><td>{doc.publisher}</td><td>{doc.publishedAt ? formatDateKo(doc.publishedAt) : '미확인'}</td><td>{doc.applicableAcademicYear ?? '—'} / {doc.cohortYear ?? '—'}</td><td>{doc.retrievedAt ? formatDateKo(doc.retrievedAt) : '미수집'}</td><td className="small">{doc.rights === 'official_public' ? '공식 공개' : doc.rights === 'link_only' ? '링크만' : doc.rights === 'restricted' ? '재배포 불가' : '미확인'}</td><td>{doc.reviewStatus === 'superseded' ? <Tone tone="info">대체됨</Tone> : <Tone tone="ok">검토 완료</Tone>}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h3>수집 작업 이력</h3>
        {d.jobs.length === 0 ? <p className="muted">아직 수집 작업이 없습니다. 배포 기본은 관리자 수동 갱신이며 자동화·알림은 사용자 요청 없이 설정하지 않습니다.</p> : (
          <ul style={{ paddingLeft: 18 }}>{d.jobs.map((j) => <li key={j.id} className="small">{j.kind} · {j.status === 'succeeded' ? <Tone tone="ok">성공</Tone> : j.status === 'partial' ? <Tone tone="warn">부분 성공</Tone> : j.status === 'failed' ? <Tone tone="bad">실패</Tone> : <Tone tone="unknown">{j.status}</Tone>} · {j.finishedAt ? formatDateKo(j.finishedAt, { withTime: true }) : '진행 중'}{j.error ? ` · ${j.error}` : ''}</li>)}</ul>
        )}
      </section>

      <section className="card">
        <h3>설계에 사용한 공식 출처 (조사 출발점)</h3>
        <p className="small muted">{registry.description}</p>
        <ul style={{ paddingLeft: 18 }}>{registry.entries.map((e) => <li key={e.id} className="small"><a href={e.url} target="_blank" rel="noreferrer noopener">{e.title}</a> · 확인 {e.checkedDate} · {e.scope} · <span className="muted">{e.limitation}</span></li>)}</ul>
      </section>
    </>
  )
}
