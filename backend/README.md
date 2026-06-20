# Ninano ENSO API

## 실행

저장소 루트가 아니라 `backend` 디렉터리에서 실행합니다.

```bash
cd backend
uv sync
uv run uvicorn server.app:app --reload --host 127.0.0.1 --port 8000
```

- API 문서: <http://127.0.0.1:8000/docs>
- 상태 확인: <http://127.0.0.1:8000/api/v1/health>
- metadata: <http://127.0.0.1:8000/api/v1/enso/metadata>

기본 데이터 위치는 `../public_data/f32_packed`입니다. 별도 디스크나 서버의 데이터를 사용할 때는 다음처럼 지정합니다.

```bash
NINANO_F32_ROOT=/data/f32_packed \
  uv run uvicorn server.app:app --host 0.0.0.0 --port 8000
```

레이어 요청 예시:

```text
GET /api/v1/enso/layers/sst?sst_anomaly=1.2&wind_delta=3
GET /api/v1/enso/layers/wind?sst_anomaly=1.2&wind_delta=3
GET /api/v1/enso/layers/t2m?sst_anomaly=1.2&wind_delta=3
```

응답은 JSON이 아니라 원본 little-endian Float32 binary입니다. `wind`는 `[u10m 전체][v10m 전체]` planar 순서로 저장되어 있습니다.

```text
GET /api/v1/enso/layers/wind?sst_anomaly=1.2&wind_delta=3&layout=planar
```

서버는 wind 파일도 계산이나 복사 없이 `FileResponse`로 그대로 전송합니다.

## 테스트

```bash
uv run pytest -q
```
