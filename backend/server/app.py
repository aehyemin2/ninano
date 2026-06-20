"""Ninano ENSO packed-F32 file API."""

import json
import math
import os
import sys
from array import array
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response


# 기본값은 저장소의 public_data/f32_packed_05deg(0.5° 다운샘플)이다.
# 원본 0.25°를 쓰려면 f32_packed로 바꾸거나 NINANO_F32_ROOT 환경변수로 지정한다.
DATA_ROOT = Path(
    os.environ.get(
        "NINANO_F32_ROOT",
        Path(__file__).resolve().parents[2] / "public_data" / "f32_packed_05deg",
    )
).expanduser().resolve()

app = FastAPI(
    title="Ninano ENSO API",
    version="0.1.0",
)

# Vite 개발 서버에서 이 API를 직접 호출할 수 있도록 허용한다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def load_manifest() -> dict:
    """manifest.json을 최초 요청 때 한 번만 읽어 메모리에 보관한다."""

    path = DATA_ROOT / "manifest.json"
    if not path.is_file():
        raise HTTPException(status_code=503, detail="manifest.json이 없습니다.")

    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=503,
            detail="manifest.json을 읽을 수 없습니다.",
        ) from error

    # 이후 요청마다 253개짜리 리스트를 set으로 다시 만들지 않도록 내부 캐시를 둔다.
    manifest["_file_set"] = frozenset(manifest.get("files", []))
    return manifest


def validate_sst(value: float) -> float:
    """SST가 -2.0~2.4 범위의 정확한 0.2 간격인지 검사한다."""

    if not math.isfinite(value):
        raise HTTPException(status_code=422, detail="SST는 유한한 숫자여야 합니다.")

    tenths = round(value * 10)
    normalized = tenths / 10
    if tenths not in range(-20, 25, 2) or not math.isclose(
        value,
        normalized,
        abs_tol=1e-9,
    ):
        raise HTTPException(
            status_code=422,
            detail="SST는 -2.0~2.4, 0.2 간격이어야 합니다.",
        )
    return normalized


def validate_wind(value: int) -> int:
    """무역풍 변화가 -5~5 범위의 정수인지 검사한다."""

    if value not in range(-5, 6):
        raise HTTPException(
            status_code=422,
            detail="바람은 -5~5 사이의 정수여야 합니다.",
        )
    return value


@lru_cache(maxsize=4)
def load_planar_wind(path_text: str, modified_ns: int) -> bytes:
    """Interleaved wind를 [u 전체][v 전체]로 바꾸고 최근 4개를 캐시한다."""

    del modified_ns  # 파일이 바뀌면 cache key도 바뀌게 하기 위한 인자다.
    values = array("f")
    with Path(path_text).open("rb") as source:
        values.fromfile(source, Path(path_text).stat().st_size // values.itemsize)
    if sys.byteorder != "little":
        values.byteswap()

    # array slicing은 Python의 요소별 for loop가 아니라 C 구현에서 수행된다.
    u10m = values[0::2]
    v10m = values[1::2]
    return u10m.tobytes() + v10m.tobytes()


@app.get("/")
def root() -> dict:
    """브라우저에서 서버 주소를 열었을 때 API 위치를 안내한다."""

    return {
        "service": "ninano-enso-api",
        "docs": "/docs",
        "health": "/api/v1/health",
    }


@app.get("/api/v1/health")
def health() -> dict:
    """서버와 packed 데이터의 준비 상태를 반환한다."""

    manifest_path = DATA_ROOT / "manifest.json"
    return {
        "status": "ok" if manifest_path.is_file() else "data_unavailable",
        "service": "ninano-enso-api",
        "version": app.version,
        "dataReady": manifest_path.is_file(),
    }


@app.get("/api/v1/enso/metadata")
def get_metadata() -> FileResponse:
    """격자·변수·파일 목록이 담긴 기존 manifest.json을 그대로 반환한다."""

    load_manifest()  # 파일 존재 여부와 JSON 형식을 먼저 검증한다.
    return FileResponse(
        path=DATA_ROOT / "manifest.json",
        media_type="application/json",
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/api/v1/enso/layers/{layer}")
def get_layer(
    layer: str,
    sst_anomaly: float = Query(..., description="-2.0~2.4, 0.2 간격"),
    wind_delta: int = Query(..., description="-5~5 정수"),
    layout: Literal["interleaved", "planar"] = Query("planar"),
) -> Response:
    """조건에 맞는 scalar 또는 interleaved wind F32 파일을 그대로 전송한다."""

    manifest = load_manifest()
    scalar_layers = set(manifest["scalar"]["variables"])
    valid_layers = scalar_layers | {"wind"}
    if layer not in valid_layers:
        raise HTTPException(
            status_code=404,
            detail=f"지원하지 않는 레이어: {layer}",
        )

    sst = validate_sst(sst_anomaly)
    wind = validate_wind(wind_delta)
    filename = f"sst_{sst:.1f}_wind_{wind}.f32"

    if filename not in manifest["_file_set"]:
        raise HTTPException(
            status_code=404,
            detail=f"manifest에 없는 조건: {filename}",
        )

    path = DATA_ROOT / layer / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"파일이 없습니다: {filename}")

    size_key = "wind" if layer == "wind" else "scalar"
    expected_size = manifest[size_key]["bytes_per_file"]
    actual_size = path.stat().st_size
    if actual_size != expected_size:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "잘못된 F32 파일 크기",
                "expected": expected_size,
                "actual": actual_size,
            },
        )

    source_is_planar = manifest["wind"].get("layout", [None])[0] == "component"
    if layer == "wind" and layout == "planar" and not source_is_planar:
        # 브라우저는 앞 절반을 u10m, 뒤 절반을 v10m view로 즉시 사용한다.
        payload = load_planar_wind(str(path), path.stat().st_mtime_ns)
        return Response(
            content=payload,
            media_type="application/octet-stream",
            headers={
                "Cache-Control": "public, max-age=3600",
                "X-Climate-Layer": layer,
                "X-Buffer-Dtype": "float32",
                "X-Buffer-Byte-Order": "little-endian",
                "X-Wind-Layout": "component_lat_lon",
            },
        )

    if layer == "wind" and layout == "interleaved" and source_is_planar:
        raise HTTPException(
            status_code=422,
            detail="wind 원본이 planar이므로 interleaved 응답을 지원하지 않습니다.",
        )

    # Python에서 파일 내용을 읽거나 JSON으로 바꾸지 않는다.
    # FileResponse가 파일을 binary stream으로 프런트에 전달한다.
    return FileResponse(
        path=path,
        media_type="application/octet-stream",
        headers={
            "Cache-Control": "public, max-age=3600",
            "X-Climate-Layer": layer,
            "X-Buffer-Dtype": "float32",
            "X-Buffer-Byte-Order": "little-endian",
            **({"X-Wind-Layout": "component_lat_lon"} if layer == "wind" else {}),
        },
    )
