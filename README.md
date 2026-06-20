## 폴더 구조

```text
enso-earth-simulator/
├─ apps/
│  └─ web/
│     └─ src/
│        ├─ components/
│        │  ├─ PacificMapCanvas.tsx          # 태평양 지도 Canvas
│        │  ├─ ControlPanel.tsx              # 0~99 슬라이더, 시간 슬라이더, 변수 선택 UI
│        │  ├─ ENSOStatusPanel.tsx           # 현재 Niño 3.4 / ENSO 상태 표시
│        │  └─ Nino34Chart.tsx               # 보간된 Niño 3.4 변화 그래프
│        │
│        ├─ render/
│        │  ├─ drawMap.ts                    # 지도 외곽선 렌더링
│        │  ├─ drawSSTLayer.ts               # 보간된 SST anomaly 색상 레이어
│        │  └─ drawWindParticles.ts          # 보간된 wind field 기반 입자 애니메이션
│        │
│        ├─ data/
│        │  ├─ loadEndpointSimulations.ts    # el_nino / la_nina endpoint 데이터 로드
│        │  ├─ interpolateSimulation.ts      # 두 endpoint 결과를 slider 값에 따라 선형 보간
│        │  └─ loadGeoJson.ts                # world.geojson 로드
│        │
│        └─ store/
│           └─ useViewerStore.ts             # 현재 slider, timestep, endpoint 데이터 상태 관리
│
├─ backend/
│  ├─ __init__.py
│  │
│  ├─ cbottle/
│  │  ├─ prepare_cbottle_input.py            # El Niño / La Niña endpoint 입력 생성
│  │  ├─ run_cbottle.py                      # cBottle 실행
│  │  └─ read_cbottle_output.py              # cBottle 출력 nc 읽기
│  │
│  ├─ processing/
│  │  ├─ extract_fields.py                   # nc에서 SST, wind 등 필요한 변수 추출
│  │  ├─ derive_enso_variables.py            # Niño 3.4, upwelling proxy 등 계산
│  │  └─ normalize_fields.py                 # 웹 렌더링용 정규화
│  │
│  └─ export/
│     └─ export_endpoint_json.py             # endpoint 결과를 웹용 JSON으로 변환
│
└─ public-data/
    └─ simulations/
        ├─ simulation_index.json
        ├─ la_nina_endpoint.json
        └─ el_nino_endpoint.json
```
