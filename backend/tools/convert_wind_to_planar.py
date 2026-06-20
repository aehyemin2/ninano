#!/usr/bin/env python3
"""Atomically convert all packed wind files from interleaved to planar layout."""

import json
import shutil
import sys
from array import array
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = REPO_ROOT / "public_data" / "f32_packed"
PLANAR_LAYOUT = ["component", "lat", "lon"]


def read_little_endian_f32(path: Path) -> array:
    values = array("f")
    with path.open("rb") as source:
        values.fromfile(source, path.stat().st_size // values.itemsize)
    if sys.byteorder != "little":
        values.byteswap()
    return values


def write_little_endian_f32(path: Path, values: array) -> None:
    if sys.byteorder == "little":
        path.write_bytes(values.tobytes())
        return
    copy = array("f", values)
    copy.byteswap()
    path.write_bytes(copy.tobytes())


def main() -> None:
    manifest_path = DATA_ROOT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest["wind"].get("layout") == PLANAR_LAYOUT:
        print("wind files are already planar; nothing to do")
        return

    source_dir = DATA_ROOT / "wind"
    build_dir = DATA_ROOT / "wind.planar-building"
    backup_dir = DATA_ROOT / "wind.interleaved-backup"
    if build_dir.exists() or backup_dir.exists():
        raise RuntimeError("이전 변환 임시 폴더가 있습니다. 수동 확인이 필요합니다.")

    filenames = manifest["files"]
    expected_size = int(manifest["wind"]["bytes_per_file"])
    build_dir.mkdir()
    try:
        for index, filename in enumerate(filenames, start=1):
            source_path = source_dir / filename
            if source_path.stat().st_size != expected_size:
                raise RuntimeError(f"잘못된 원본 크기: {source_path}")
            interleaved = read_little_endian_f32(source_path)
            planar = interleaved[0::2]
            planar.extend(interleaved[1::2])
            target_path = build_dir / filename
            write_little_endian_f32(target_path, planar)
            if target_path.stat().st_size != expected_size:
                raise RuntimeError(f"잘못된 변환 결과 크기: {target_path}")
            converted = read_little_endian_f32(target_path)
            field_size = len(interleaved) // 2
            if (
                converted[0:3] != interleaved[0:6:2]
                or converted[field_size:field_size + 3] != interleaved[1:6:2]
            ):
                raise RuntimeError(f"wind 성분 검증 실패: {target_path}")
            if index == 1 or index % 10 == 0 or index == len(filenames):
                print(f"[{index:03d}/{len(filenames)}] {filename}", flush=True)

        manifest["wind"]["layout"] = PLANAR_LAYOUT
        manifest["wind"]["shape"] = [
            2,
            manifest["lat_size"],
            manifest["lon_size"],
        ]
        manifest["wind"]["index_formula"] = (
            "idx = latIndex * lonSize + lonIndex; "
            "u = arr[idx]; v = arr[fieldSize + idx]"
        )
        manifest_temp = DATA_ROOT / "manifest.json.planar-building"
        manifest_temp.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        # 디렉터리와 manifest를 교체하는 짧은 구간에만 기존 폴더를 backup으로 둔다.
        source_dir.rename(backup_dir)
        try:
            build_dir.rename(source_dir)
            manifest_temp.replace(manifest_path)
        except Exception:
            if source_dir.exists():
                source_dir.rename(build_dir)
            backup_dir.rename(source_dir)
            raise
        shutil.rmtree(backup_dir)
    except Exception:
        if build_dir.exists():
            shutil.rmtree(build_dir)
        raise

    print("complete: wind files and manifest now use [component, lat, lon]")


if __name__ == "__main__":
    main()
