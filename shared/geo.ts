/** 직선거리만 계산한다. 통학 시간으로 환산하지 않는다. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371.0088
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function formatStraightLine(km: number): string {
  if (km < 1) return `직선 ${Math.round(km * 1000)} m`
  return `직선 ${km.toFixed(1)} km`
}

/** 서울 대략 경계 안인지 (좌표 검증용 느슨한 상자). 배정 가능 여부와 무관하다. */
export function isPlausiblySeoul(p: { lat: number; lng: number }): boolean {
  return p.lat > 37.4 && p.lat < 37.72 && p.lng > 126.75 && p.lng < 127.2
}
