"""0.25° packed-F32 데이터를 0.5°로 다운샘플한다.

0.5° 격자점(90, 89.5, …)은 0.25° 격자점(90, 89.75, 89.5, …)의 부분집합이므로
stride-2 서브샘플링이면 보간 오차 없이 정확한 값이 나오고, SST의 육지 NaN
구조도 그대로 보존된다. 결과는 새 폴더(f32_packed_05deg)에 쓰고 원본은 건드리지
않는다.

실행:
    .venv/bin/python backend/tools/downsample_to_05deg.py
"""

import json
from pathlib import Path

import numpy as np

STRIDE = 2

SRC = Path(__file__).resolve().parents[2] / "public_data" / "f32_packed"
DST = Path(__file__).resolve().parents[2] / "public_data" / "f32_packed_05deg"


def downsample_field(values: np.ndarray, lat_size: int, lon_size: int) -> np.ndarray:
    """(lat*lon,) 1차원 배열을 lat/lon 양방향으로 stride-2 서브샘플한다."""
    grid = values.reshape(lat_size, lon_size)
    return grid[::STRIDE, ::STRIDE].reshape(-1)


def main() -> None:
    manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))
    lat_size = manifest["lat_size"]
    lon_size = manifest["lon_size"]
    field_size = lat_size * lon_size

    new_lat_size = len(range(0, lat_size, STRIDE))
    new_lon_size = len(range(0, lon_size, STRIDE))
    new_field_size = new_lat_size * new_lon_size

    scalar_vars = manifest["scalar"]["variables"]
    files = manifest["files"]
    folders = scalar_vars + ["wind"]

    print(f"src grid {lat_size}x{lon_size} -> dst grid {new_lat_size}x{new_lon_size}")
    print(f"files per folder: {len(files)} | folders: {folders}")

    DST.mkdir(parents=True, exist_ok=True)

    total = len(folders) * len(files)
    done = 0
    for folder in folders:
        is_wind = folder == "wind"
        (DST / folder).mkdir(parents=True, exist_ok=True)
        for name in files:
            data = np.fromfile(SRC / folder / name, dtype="<f4")
            if is_wind:
                # planar: 앞 절반 u10m, 뒤 절반 v10m. 각 성분을 따로 줄인다.
                u = downsample_field(data[:field_size], lat_size, lon_size)
                v = downsample_field(data[field_size:], lat_size, lon_size)
                out = np.concatenate([u, v])
            else:
                out = downsample_field(data, lat_size, lon_size)
            out.astype("<f4").tofile(DST / folder / name)
            done += 1
        print(f"  {folder}: {len(files)} files  ({done}/{total})")

    # 새 manifest: 격자 크기·step·파일 크기만 갱신, 나머지는 원본 구조 유지.
    lat_order = dict(manifest["lat_order"])
    lon_order = dict(manifest["lon_order"])
    lat_order["step"] = manifest["lat_order"]["step"] * STRIDE
    lon_order["step"] = manifest["lon_order"]["step"] * STRIDE
    lat_order["last"] = lat_order["first"] + lat_order["step"] * (new_lat_size - 1)
    lon_order["last"] = lon_order["first"] + lon_order["step"] * (new_lon_size - 1)

    new_manifest = dict(manifest)
    new_manifest["lat_size"] = new_lat_size
    new_manifest["lon_size"] = new_lon_size
    new_manifest["lat_order"] = lat_order
    new_manifest["lon_order"] = lon_order
    new_manifest["scalar"] = {
        **manifest["scalar"],
        "shape": [new_lat_size, new_lon_size],
        "bytes_per_file": new_field_size * 4,
    }
    new_manifest["wind"] = {
        **manifest["wind"],
        "shape": [2, new_lat_size, new_lon_size],
        "bytes_per_file": new_field_size * 8,
    }
    (DST / "manifest.json").write_text(
        json.dumps(new_manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"done -> {DST}")
    print(f"scalar bytes/file: {new_field_size * 4} | wind bytes/file: {new_field_size * 8}")


if __name__ == "__main__":
    main()
