# ENSO Earth Simulator

Earth2Studio/cBottle로 생성한 ENSO 기후 실험 결과를 평면 지도와 3D 지구에서 탐색하는 웹 프로젝트입니다.

현재 프런트엔드는 React 19, TypeScript, Vite, WebGL2와 Canvas overlay로 구성되어 있습니다. SST anomaly와 무역풍 변화 슬라이더를 놓으면 선택 기후장을 먼저 표시하고 wind는 이어서 지연 로딩합니다.

## 주요 기능

- SST anomaly: `-2.0 ~ +2.4 °C`, `0.2 °C` 간격
- 무역풍 변화: `-5 ~ +5 m/s`, `1 m/s` 간격
- 표시 레이어: `sst`, `t2m`, `tpf`, `msl`, `tcwv`
- `u10m`, `v10m` 벡터 기반 바람 입자 애니메이션
- 드래그와 휠 확대를 지원하는 평면 지도
- 드래그 회전과 휠 확대를 지원하는 3D 지구
- Natural Earth 기반 육지 경계선
- Niño 3.4 SST, 적도 동서 바람 및 SST 편차 진단
- 0.25° 변수별 packed Float32 파일 지연 로딩

## 프로젝트 구조

```text
ninano/
├─ apps/
│  └─ web/
│     ├─ index.html
│     ├─ package.json
│     ├─ vite.config.ts             # React 설정 및 개발용 public_data 제공
│     ├─ tsconfig.json
│     └─ src/
│        ├─ main.tsx                # React 진입점
│        ├─ App.tsx                 # 데이터 로딩과 전체 화면 조립
│        ├─ styles.css              # 화면 및 반응형 스타일
│        ├─ components/
│        │  ├─ ControlPanel.tsx     # 실험 슬라이더와 레이어 선택
│        │  ├─ PacificMapCanvas.tsx # WebGL/Canvas 레이어와 지도 조작
│        │  ├─ ENSOStatusPanel.tsx  # ENSO 영역 평균 지표
│        │  ├─ Nino34Chart.tsx      # 적도 SST 편차 그래프
│        │  └─ Icon.tsx             # 공통 SVG 아이콘
│        ├─ data/
│        │  ├─ ensoApi.ts           # packed F32/API/preview 로딩과 캐시
│        │  ├─ readF32Frame.ts      # scalar 및 planar wind 파싱
│        │  ├─ demoSimulation.ts    # 데이터 연결 실패 시 preview
│        │  ├─ variableCatalog.ts   # 단위, 범위, 색상표 구성
│        │  └─ loadGeoJson.ts       # 육지 경계 좌표 로딩
│        ├─ render/
│        │  ├─ drawSSTLayer.ts      # 선택 기후장 렌더링과 좌표 변환
│        │  ├─ webglFieldRenderer.ts # 평면 scalar R32F 렌더링
│        │  ├─ webglWindRenderer.ts  # GPU wind texture/particle 렌더링
│        │  ├─ drawWindParticles.ts  # WebGL 미지원 시 Canvas fallback
│        │  ├─ drawMap.ts           # 평면 경위도 격자
│        │  ├─ drawGlobe.ts         # 3D 지구 투영
│        │  └─ drawLandBoundaries.ts
│        ├─ store/
│        │  └─ useViewerStore.ts    # 실험값과 화면 상태
│        └─ types/
│           └─ simulation.ts        # 데이터 계약 타입
├─ backend/                         # 백엔드 담당 영역
├─ public_data/
│  └─ f32_packed/                  # 변수별 0.25° Float32 데이터
│     ├─ manifest.json
│     ├─ sst/
│     ├─ t2m/
│     ├─ tpf/
│     ├─ msl/
│     ├─ tcwv/
│     └─ wind/
├─ pyproject.toml                  # Python/Earth2Studio 의존성
└─ uv.lock
```

`backend`와 `public_data`는 다른 담당 영역이며, 프런트엔드는 해당 결과를 읽기만 합니다.

## 웹 실행

터미널 하나에서 FastAPI를 실행합니다.

```bash
cd backend
uv sync
uv run uvicorn server.app:app --reload --port 8000
```

다른 터미널에서 Vite를 실행합니다.

Windows의 파일 탐색기에서 `index.html`을 직접 열면 모듈과 데이터 요청이 동작하지 않습니다. Ubuntu/WSL에서 Vite 개발 서버를 실행해야 합니다.

```bash
wsl -d Ubuntu-24.04
cd /mnt/d/ninano/ninano/apps/web
npm install
npm run dev
```

터미널에 표시된 주소(기본값 `http://localhost:5173`)를 브라우저에서 엽니다.

`nvm`은 필수가 아닙니다. 다음 명령으로 Node와 npm 설치 여부를 먼저 확인할 수 있습니다.

```bash
node --version
npm --version
```

코드 검사와 production build는 다음과 같습니다.

```bash
npm run typecheck
npm run build
```

## 현재 데이터 로딩 방식

프런트엔드는 먼저 FastAPI의 변수별 레이어 API를 호출합니다. 개발 중 Vite는 `/api` 요청을 `http://127.0.0.1:8000`으로 프록시합니다.

```text
/api/v1/enso/metadata
/api/v1/enso/layers/{layer}?sst_anomaly=1.2&wind_delta=3
```

FastAPI가 실행되지 않을 때는 `vite.config.ts`의 개발 서버 middleware가 저장소의 `public_data`를 다음 URL로 제공합니다.

```text
/public_data/f32_packed/manifest.json
/public_data/f32_packed/sst/{file}.f32
/public_data/f32_packed/t2m/{file}.f32
/public_data/f32_packed/tpf/{file}.f32
/public_data/f32_packed/msl/{file}.f32
/public_data/f32_packed/tcwv/{file}.f32
/public_data/f32_packed/wind/{file}.f32
```

데이터 로딩 우선순위는 다음과 같습니다.

```text
FastAPI 변수별 packed F32
        │ 실패
        ▼
Vite 정적 packed F32
        │ 실패
        ▼
브라우저 preview 데이터
```

preview는 UI 확인을 위한 가상 데이터이며 실제 cBottle 결과가 아닙니다.

## Packed F32 데이터 계약

### 파일명

모든 변수 폴더가 같은 파일명을 사용합니다.

```text
sst_{sst_anomaly}_wind_{wind_delta}.f32
```

예시는 다음과 같습니다.

```text
sst_0.0_wind_0.f32
sst_2.4_wind_5.f32
sst_-2.0_wind_-5.f32
```

SST 23단계와 wind 11단계 조합으로 변수 폴더마다 총 253개 조건을 가집니다.

### 격자

격자 크기와 순서는 `manifest.json`을 기준으로 하므로 프런트 코드에 `LATSIZE`, `LONSIZE`를 고정하지 않습니다.

| 항목 | 현재 값 |
| --- | --- |
| 위도 | `90.0 → -90.0`, 간격 `-0.25°`, 721개 |
| 경도 | `0.0 → 359.75`, 간격 `0.25°`, 1,440개 |
| dtype | little-endian `float32` |
| 셀 개수 | 1,038,240 |

### Scalar 파일

`sst`, `t2m`, `tpf`, `msl`, `tcwv`는 각각 하나의 2차원 필드입니다.

```text
layout: [lat, lon]
index = latIndex * lonSize + lonIndex
shape:  [721, 1440]
size:   4,152,960 bytes
```

### Wind 파일

wind 파일 하나에는 `u10m` 전체 격자 뒤에 `v10m` 전체 격자가 저장됩니다.

```text
layout: [component, lat, lon]
shape:  [2, 721, 1440]

index = latIndex * lonSize + lonIndex
u10m  = values[index]
v10m  = values[fieldSize + index]

size: 8,305,920 bytes
```

정적 fallback과 FastAPI 모두 같은 planar wind를 사용합니다. 프런트는 복사나 반복문 없이 `u10m`, `v10m` 두 `Float32Array` view를 즉시 생성합니다. 두 성분은 바람 입자의 방향과 속도 계산에 사용됩니다.

### 원시값 변환

F32에는 원시 모델 단위가 들어 있으므로 브라우저에서 표시 단위로 변환합니다.

| 변수 | 입력 | 화면 변환 |
| --- | --- | --- |
| `sst` | K | `K - 273.15` → °C |
| `t2m` | K | `K - 273.15` → °C |
| `tpf` | kg m⁻² s⁻¹ 상당 flux | `max(0, value × 86400)` → mm/day |
| `msl` | Pa | `Pa / 100` → hPa |
| `tcwv` | kg/m² | 음수만 0으로 제한 |
| `u10m`, `v10m` | m/s | 변환 없음 |

`NaN`은 데이터 없음으로 취급하며 지도에서 투명하게 표시합니다.

## 요청과 캐시 동작

- 최초 로딩 시 `(SST 0.0, wind 0)`의 `sst`와 기본 표시 레이어를 먼저 읽고 wind를 이어서 읽습니다.
- 표시 레이어를 바꾸면 해당 scalar 폴더의 파일만 추가로 읽습니다.
- 실험 슬라이더를 움직이면 해당 조건의 요청을 즉시 시작합니다.
- 슬라이더를 연속해서 움직이면 이전 요청은 `AbortController`로 취소합니다.
- 조건 변경 시 선택 scalar와 SST가 도착하면 WebGL 지도를 즉시 바꾸고, wind가 도착하면 GPU 입자를 시작합니다.
- 파싱한 필드는 최대 96 MiB 범위에서 LRU 방식으로 메모리에 캐시합니다.

## 화면 렌더링

표시 가능한 색상 레이어는 다음 5개입니다.

| 변수 | 의미 | 표시 단위 |
| --- | --- | --- |
| `sst` | 해수면 온도 | °C |
| `t2m` | 지표 2m 공기 온도 | °C |
| `tpf` | 강수량 | mm/day |
| `msl` | 평균 해면 기압 | hPa |
| `tcwv` | 대기 기둥 수증기량 | kg/m² |

바람 입자는 각 위치의 벡터를 다음과 같이 사용합니다.

```text
speed = sqrt(u10m² + v10m²)
longitude += u10m × timeStep / cos(latitude)
latitude  += v10m × timeStep
```

이 계산은 흐름을 직관적으로 보여주기 위한 화면 애니메이션이며, 물리 시간 적분 결과로 사용하지 않습니다.

평면 지도는 33%에서 `360° × 180°` 전체 범위를 표시하고 모든 확대 단계에서 경도:위도 범위를 2:1로 유지합니다.

## 배포 시 주의사항

`npm run build`는 `apps/web/dist`에 프런트엔드만 생성합니다. 대용량 `public_data`는 dist에 복사하지 않습니다.

운영 환경에서는 Nginx, CDN, Object Storage 또는 백엔드가 `f32_packed` 디렉터리를 정적 파일로 제공해야 합니다. 데이터 주소가 프런트와 다르면 빌드 전에 설정합니다.

```bash
export VITE_F32_BASE_URL=https://data.example.com/f32_packed
npm run build
```

해당 주소 바로 아래에는 `manifest.json`, `sst/`, `t2m/`, `tpf/`, `msl/`, `tcwv/`, `wind/`가 있어야 합니다. 다른 origin을 사용하면 데이터 서버의 CORS 설정도 필요합니다.

FastAPI 통합 frame을 fallback으로 사용할 경우 다음 주소를 설정합니다.

```bash
export VITE_API_BASE_URL=https://api.example.com/api/v1
```

## Python 환경

Python/Earth2Studio 작업은 Windows Python이 아니라 Ubuntu/WSL 환경을 기준으로 합니다. 프로젝트는 Python 3.13을 사용합니다.

```bash
wsl -d Ubuntu-24.04
cd /mnt/d/ninano/ninano
uv sync
```

프런트엔드와 로컬 packed F32 확인에는 NVIDIA GPU가 필요하지 않습니다. 실제 Earth2Studio/cBottle 모델 실행에 필요한 장치는 사용하는 모델과 실행 설정에 따라 별도로 확인해야 합니다.

## 자동 생성 파일

- `apps/web/node_modules/`: `npm install`로 설치한 패키지
- `apps/web/dist/`: `npm run build` 결과
- `apps/web/tsconfig.app.tsbuildinfo`: TypeScript 증분 빌드 캐시
- `apps/web/package-lock.json`: 재현 가능한 npm 설치를 위한 잠금 파일

`node_modules`, `dist`, `tsbuildinfo`는 직접 수정하지 않습니다.
