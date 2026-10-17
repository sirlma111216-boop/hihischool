-- 학교 유형 세부 구분(공식 원문)과 제공처 간 충돌 기록
-- school_subtype: 나이스 SPCLY_PURPS_HS_ORD_NM 등 공식 세부 구분 원문 (예: '산업수요 맞춤형 고등학교', '외국어계열'). 없으면 NULL.
-- source_conflicts: [{"field":"schoolType","values":[{"provider":"schoolinfo","value":"일반고등학교"},{"provider":"neis","value":"자율고"}]}] — 검토 전 임의 선택하지 않는다.
ALTER TABLE schools ADD COLUMN school_subtype TEXT;
ALTER TABLE schools ADD COLUMN source_conflicts TEXT NOT NULL DEFAULT '[]';
