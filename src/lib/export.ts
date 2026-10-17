import { csvSafeCell } from '@shared/normalize'
import type { AdmissionEvent, CounselingSession } from '@shared/types'

export function downloadBlob(name: string, content: string | Blob, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob(['\ufeff', content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvSafeCell).join(',')).join('\r\n')
}

/** 선택한 일정을 ICS 로. 시각이 없으면 종일 일정으로만 쓴다 (00:00 을 만들지 않음). 출처를 DESCRIPTION 에 남긴다. */
export function toIcs(events: (AdmissionEvent & { sourceTitle?: string })[]): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//highschool-atlas//KO', 'CALSCALE:GREGORIAN']
  for (const e of events) {
    const ymd = e.date.replace(/-/g, '')
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.id}@highschool-atlas`)
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`)
    if (e.allDay || !e.time) {
      lines.push(`DTSTART;VALUE=DATE:${ymd}`)
      const end = e.endDate ? addDay(e.endDate) : addDay(e.date)
      lines.push(`DTEND;VALUE=DATE:${end.replace(/-/g, '')}`)
    } else {
      lines.push(`DTSTART;TZID=Asia/Seoul:${ymd}T${e.time.replace(':', '')}00`)
    }
    lines.push(`SUMMARY:${esc(e.title)}`)
    lines.push(`DESCRIPTION:${esc(`상태: ${e.status} / 확인일: ${e.confirmedAt ?? '미확인'} / 출처: ${e.sourceTitle ?? '근거 ' + e.evidenceIds.join(', ')}`)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function addDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/* ---------- 상담 백업 (선택: 암호화) ---------- */
export async function encryptJson(obj: unknown, password: string): Promise<string> {
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, keyMat, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)))
  return JSON.stringify({ format: 'atlas-backup-v1', kdf: 'PBKDF2-SHA256-310000', salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(ct)) })
}
export async function decryptJson<T>(text: string, password: string): Promise<T> {
  const p = JSON.parse(text) as { format: string; salt: string; iv: string; data: string }
  if (p.format !== 'atlas-backup-v1') throw new Error('암호화 백업 형식이 아닙니다.')
  const enc = new TextEncoder()
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(p.salt), iterations: 310000, hash: 'SHA-256' }, keyMat, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p.iv) }, key, unb64(p.data))
  return JSON.parse(new TextDecoder().decode(pt)) as T
}
function b64(u: Uint8Array): string {
  let s = ''
  for (const b of u) s += String.fromCharCode(b)
  return btoa(s)
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** 세션을 내보낼 때 민감 항목 제외 옵션 */
export function exportSession(s: CounselingSession, opts: { includePrivateNotes: boolean }): CounselingSession {
  return { ...s, privateNotes: opts.includePrivateNotes ? s.privateNotes : '' }
}
