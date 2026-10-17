/** 단순 고정 창 속도 제한 (D1 기반). 무료 범위에서 과도한 관리 API 호출을 막는 용도. */
export async function checkRateLimit(db: D1Database, key: string, limitPerMin: number): Promise<boolean> {
  const windowStart = Math.floor(Date.now() / 60000) * 60000
  const bucket = `${key}:${windowStart}`
  await db
    .prepare(`INSERT INTO rate_limits (bucket, count, window_start) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1`)
    .bind(bucket, windowStart)
    .run()
  const row = await db.prepare(`SELECT count FROM rate_limits WHERE bucket = ?`).bind(bucket).first<{ count: number }>()
  // 오래된 창 정리 (가끔)
  if (Math.random() < 0.05) await db.prepare(`DELETE FROM rate_limits WHERE window_start < ?`).bind(windowStart - 5 * 60000).run()
  return (row?.count ?? 0) <= limitPerMin
}
