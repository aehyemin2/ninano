# ENSO Earth Simulator

Earth2Studio/cBottle의 기후 데이터를 바탕으로 태평양의 온도, 바람, 해면 기압,
대기 수증기를 탐색하는 React 웹 프로젝트입니다.

현재 `apps/web`은 백엔드 데이터가 없어도 화면을 확인할 수 있도록 preview 데이터를
사용합니다. 추후 다른 부서에서 endpoint JSON을 제공하면 같은 화면이 실제 데이터로
자동 전환되도록 구성되어 있습니다.

## 현재 폴더 구조

```text
ninano/
├─ apps/
│  └─ web/
│     ├─ index.html                  # 브라우저가 처음 여는 HTML
│     ├─ package.json                # 실행 명령과 npm 패키지 목록
│     ├─ package-lock.json           # 설치된 패키지 버전 고정 파일
│     ├─ vite.config.ts              # Vite 개발 서버 설정
│     ├─ tsconfig.json               # TypeScript 프로젝트 진입 설정
│     ├─ tsconfig.app.json           # 실제 src 검사 규칙
│     └─ src/
│        ├─ main.tsx                 # React 앱 시작점
│        ├─ App.tsx                  # 전체 대시보드 조립 및 데이터 로드
│        ├─ styles.css               # 전체 화면·반응형 디자인
│        ├─ vite-env.d.ts            # Vite 환경 변수 타입 선언
│        │
│        ├─ components/
│        │  ├─ PacificMapCanvas.tsx  # 기후장 Canvas와 마우스 좌표 조회
│        │  ├─ ControlPanel.tsx      # 시나리오·변수·시간·바람 제어
│        │  ├─ ENSOStatusPanel.tsx   # ENSO 상태 및 영역 평균 지표
│        │  ├─ Nino34Chart.tsx       # 적도 2m 기온 프로파일 차트
│        │  └─ Icon.tsx              # 공통 SVG 아이콘
│        │
│        ├─ data/
│        │  ├─ loadEndpointSimulations.ts # JSON 요청 및 preview 전환
│        │  ├─ interpolateSimulation.ts   # endpoint 사이 값 보간
│        │  ├─ demoSimulation.ts          # 백엔드 연결 전용 preview 데이터
│        │  ├─ variableCatalog.ts         # 변수 단위·범위·색상표
│        │  └─ loadGeoJson.ts             # 추후 실제 해안선 GeoJSON 로더
│        │
│        ├─ render/
│        │  ├─ drawMap.ts             # 격자와 간이 해안선 오버레이
│        │  ├─ drawSSTLayer.ts        # 선택된 기후 변수 색상 레이어
│        │  └─ drawWindParticles.ts   # u10m/v10m 기반 바람 입자
│        │
│        ├─ store/
│        │  └─ useViewerStore.ts      # 화면 선택 상태를 공유하는 Context
│        │
│        └─ types/
│           └─ simulation.ts          # 프런트·백엔드 데이터 계약 타입
│
├─ backend/                           # 다른 부서 담당 영역
└─ public_data/                       # 다른 부서 담당 결과 데이터 영역
```

## 파일별 설명

### 앱 시작과 설정

| 파일 | 역할 | 직접 수정 여부 |
| --- | --- | --- |
| `index.html` | `#root` 엘리먼트를 만들고 `main.tsx`를 불러옵니다. | 제목이나 meta 정보 변경 시 |
| `src/main.tsx` | React를 실행하고 전역 store와 CSS를 연결합니다. | 전역 Provider 추가 시 |
| `src/App.tsx` | 데이터를 읽은 뒤 왼쪽 제어판, 중앙 지도, 오른쪽 분석 패널을 조립합니다. | 화면 구조 변경 시 |
| `src/styles.css` | 색상, 간격, 레이아웃과 모바일 반응형 규칙을 관리합니다. | 디자인 변경 시 |
| `package.json` | `npm run dev`, `build`, `typecheck` 명령과 React/Vite 버전을 관리합니다. | 패키지 추가 시 |
| `package-lock.json` | 모든 하위 패키지 버전을 고정해 같은 설치 결과를 만듭니다. | 직접 수정하지 않음 |
| `vite.config.ts` | 개발 서버 포트와 React 플러그인을 설정합니다. | 서버 설정 변경 시 |
| `tsconfig*.json` | TypeScript의 strict 검사와 브라우저 대상 설정을 관리합니다. | 타입 검사 정책 변경 시 |
| `vite-env.d.ts` | `import.meta.env` 등 Vite 전용 타입을 TypeScript에 알려줍니다. | 보통 수정하지 않음 |

### 화면 컴포넌트

| 파일 | 역할 |
| --- | --- |
| `ControlPanel.tsx` | La Niña–Neutral–El Niño 슬라이더, 표시 변수, 시간, 바람 입자 표시 여부를 바꿉니다. |
| `PacificMapCanvas.tsx` | 선택된 프레임을 Canvas에 그리고 마우스 위치의 좌표·값·풍속을 표시합니다. |
| `ENSOStatusPanel.tsx` | Niño 3.4 영역의 `t2m` 평균과 적도 `u10m` 평균을 보여줍니다. |
| `Nino34Chart.tsx` | 단일 시점에서도 비교할 수 있도록 적도 ±5°의 2m 공기 온도 프로파일을 표시합니다. 실제 SST anomaly 차트는 아닙니다. |
| `Icon.tsx` | 외부 아이콘 라이브러리 없이 화면에서 사용하는 SVG 아이콘을 제공합니다. |

### 데이터 처리

| 파일 | 역할 |
| --- | --- |
| `types/simulation.ts` | 위도·경도 격자, 변수 배열, 시각, endpoint 구조를 TypeScript 타입으로 정의합니다. 백엔드 JSON도 이 구조를 따라야 합니다. |
| `variableCatalog.ts` | NetCDF에서 확인한 변수의 이름, 단위, 표시 범위, 범례 눈금과 색상표를 정의합니다. |
| `loadEndpointSimulations.ts` | `/data/simulations/simulation_index.json`을 요청합니다. 요청이 실패하면 `demoSimulation.ts`를 사용합니다. |
| `demoSimulation.ts` | UI 개발용 가상 기후장을 생성합니다. 실제 cBottle 예측 결과가 아니며 화면 preview 용도입니다. |
| `interpolateSimulation.ts` | 슬라이더 값에 따라 La Niña–Neutral 또는 Neutral–El Niño endpoint의 각 격자값을 선형 보간합니다. |
| `loadGeoJson.ts` | 향후 `world.geojson`이 제공될 때 실제 해안선을 읽기 위한 로더입니다. 현재 지도는 간이 해안선을 사용합니다. |

### Canvas 렌더링

| 파일 | 역할 |
| --- | --- |
| `drawSSTLayer.ts` | 파일명은 초기 설계에서 남았지만 현재는 SST만이 아니라 `t2m`, `msl`, `tcwv`, `wind`를 모두 그립니다. `wind`는 `u10m`, `v10m`으로 계산합니다. |
| `drawMap.ts` | 기후장 위에 경위도 격자, 적도선, 간이 해안선을 그립니다. |
| `drawWindParticles.ts` | `u10m`, `v10m` 방향으로 움직이는 입자를 애니메이션합니다. |

## 화면까지 데이터가 전달되는 과정

```text
simulation_index.json
        │
        ▼
loadEndpointSimulations.ts ── 실패 시 ──▶ demoSimulation.ts
        │
        ▼
interpolateSimulation.ts ◀── ControlPanel 시나리오 슬라이더
        │
        ▼
App.tsx
   ├─ PacificMapCanvas.tsx ─▶ drawSSTLayer / drawMap / drawWindParticles
   ├─ ENSOStatusPanel.tsx
   └─ Nino34Chart.tsx
```

## NetCDF에서 확인한 변수

`neutral_2013-12-15.nc`에는 다음 다섯 개의 기후 변수가 있습니다.

| 변수 | 의미 | 화면 사용처 |
| --- | --- | --- |
| `t2m` | 2m 공기 온도, K | 온도 레이어, Niño 3.4 영역 보조 지표 |
| `u10m` | 10m 동서 바람, m/s | 풍속 계산, 바람 입자의 X 방향 |
| `v10m` | 10m 남북 바람, m/s | 풍속 계산, 바람 입자의 Y 방향 |
| `msl` | 평균 해면 기압, Pa | 해면 기압 레이어 |
| `tcwv` | 대기 전체 수증기량, kg/m² | 수증기 레이어 |

현재 파일에는 `sst`와 평년값(climatology)이 없습니다. 따라서 정식 Niño 3.4
SST anomaly는 계산하지 않으며, 화면에도 데이터가 추가로 필요하다고 표시합니다.

## 자동 생성되는 파일

- `node_modules/`: `npm install`로 받은 패키지입니다. 수정하거나 Git에 올리지 않습니다.
- `dist/`: `npm run build` 결과입니다. 다시 빌드할 수 있으므로 직접 수정하지 않습니다.
- `tsconfig.app.tsbuildinfo`: TypeScript가 빠른 재검사를 위해 만드는 캐시입니다.
- `package-lock.json`: 자동 생성되지만 재현 가능한 설치를 위해 Git에는 포함합니다.

## 웹 실행

Ubuntu에는 Node 22가 설치되어 있습니다. 먼저 버전을 확인한 뒤 실행합니다.

```bash
node --version
npm --version
cd /mnt/d/ninano/ninano/apps/web
npm install
npm run dev
```

개인적으로 `nvm`을 사용하는 환경에서는 `apps/web/.nvmrc`의 버전을 사용할 수도
있지만, 이 프로젝트를 실행하는 데 `nvm`이 필수는 아닙니다.

검사와 production build는 다음 명령으로 실행합니다.

```bash
npm run typecheck
npm run build
```
