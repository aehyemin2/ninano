#!/usr/bin/env python3
"""cBottleInfill combined SST and trade-wind sensitivity demo."""

from __future__ import annotations

import argparse
import random
import time
from collections import OrderedDict
from datetime import datetime
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default="2015-12-15T00:00:00")
    parser.add_argument("--delta-sst", type=float, default=2.0)
    parser.add_argument("--delta-u10m", type=float, default=3.0)
    parser.add_argument("--delta-v10m", type=float, default=0.0)
    parser.add_argument("--sampler-steps", type=int, default=8)
    parser.add_argument("--sigma-max", type=float, default=200.0)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    parser.add_argument("--outdir", default="outputs_cbottle_combined_demo")
    parser.add_argument("--lat-min", type=float, default=-5.0)
    parser.add_argument("--lat-max", type=float, default=5.0)
    parser.add_argument("--lon-min", type=float, default=190.0)
    parser.add_argument("--lon-max", type=float, default=240.0)
    parser.add_argument("--sst-shape", choices=["box", "gaussian"], default="gaussian")
    parser.add_argument("--wind-shape", choices=["box", "gaussian"], default="box")
    parser.add_argument("--save-tensors", action="store_true")
    return parser.parse_args()


def axis(coords: OrderedDict, name: str) -> int:
    return list(coords.keys()).index(name)


def variable_index(coords: OrderedDict, name: str) -> int:
    names = list(coords["variable"])
    if name not in names:
        raise KeyError(f"{name!r} is not present in {names}")
    return names.index(name)


def coordinate(coords: OrderedDict, name: str) -> np.ndarray:
    value = coords[name]
    if isinstance(value, torch.Tensor):
        return value.detach().cpu().numpy()
    return np.asarray(value)


def reset_seed(seed: int, model=None) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    if model is not None and hasattr(model, "set_seed"):
        try:
            model.set_seed(seed)
        except Exception:
            pass


def sync() -> None:
    if torch.cuda.is_available():
        torch.cuda.synchronize()


def run_timed(label: str, function):
    sync()
    started = time.perf_counter()
    result = function()
    sync()
    print(f"{label}: {time.perf_counter() - started:.2f}s")
    return result


def longitude_distance(lon: np.ndarray, center: float) -> np.ndarray:
    difference = np.abs(lon - center)
    return np.minimum(difference, 360.0 - difference)


def anomaly_weight(
    coords: OrderedDict,
    shape: str,
    lat_min: float,
    lat_max: float,
    lon_min: float,
    lon_max: float,
) -> torch.Tensor:
    lat = coordinate(coords, "lat")
    lon = coordinate(coords, "lon")

    if shape == "box":
        weight = (
            ((lat >= lat_min) & (lat <= lat_max))[:, None]
            & ((lon >= lon_min) & (lon <= lon_max))[None, :]
        ).astype(np.float32)
    else:
        center_lat = (lat_min + lat_max) / 2
        center_lon = (lon_min + lon_max) / 2
        lat_weight = np.exp(-0.5 * ((lat - center_lat) / 5.0) ** 2)
        lon_weight = np.exp(-0.5 * (longitude_distance(lon, center_lon) / 18.0) ** 2)
        weight = (lat_weight[:, None] * lon_weight[None, :]).astype(np.float32)
        gate = (
            ((lat >= lat_min - 10) & (lat <= lat_max + 10))[:, None]
            & ((lon >= lon_min - 36) & (lon <= lon_max + 36))[None, :]
        )
        weight = np.where(gate, weight, 0.0)
        weight /= np.nanmax(weight)

    return torch.from_numpy(weight)


def add_anomaly(
    data: torch.Tensor,
    coords: OrderedDict,
    variable: str,
    delta: float,
    weight: torch.Tensor,
) -> torch.Tensor:
    if delta == 0:
        return data

    var_axis = axis(coords, "variable")
    lat_axis = axis(coords, "lat")
    lon_axis = axis(coords, "lon")
    var_index = variable_index(coords, variable)
    leading = [i for i in range(data.ndim) if i not in (var_axis, lat_axis, lon_axis)]
    permutation = leading + [var_axis, lat_axis, lon_axis]
    inverse = np.argsort(permutation)

    result = data.permute(*permutation).contiguous()
    result[..., var_index, :, :] += delta * weight.to(result.device, result.dtype)
    return result.permute(*inverse).contiguous()


def print_change(original, modified, coords, variable) -> None:
    var_axis = axis(coords, "variable")
    index = torch.tensor([variable_index(coords, variable)], device=original.device)
    difference = torch.index_select(modified - original, var_axis, index).float()
    finite = difference[torch.isfinite(difference)]
    print(
        f"{variable}: mean={finite.mean().item():+.4f}, "
        f"min={finite.min().item():+.4f}, max={finite.max().item():+.4f}"
    )


def extract(output, coords, variable, sample=0) -> np.ndarray:
    var_axis = axis(coords, "variable")
    lat_axis = axis(coords, "lat")
    lon_axis = axis(coords, "lon")
    leading = [i for i in range(output.ndim) if i not in (var_axis, lat_axis, lon_axis)]
    result = output.permute(*(leading + [var_axis, lat_axis, lon_axis])).contiguous()
    result = result.reshape(-1, result.shape[-3], result.shape[-2], result.shape[-1])
    return result[sample, variable_index(coords, variable)].float().cpu().numpy()


def save_map(field, lat, lon, title, path, difference=False) -> None:
    figure, axes = plt.subplots(figsize=(13, 5))
    options = {"cmap": "turbo"}
    if difference:
        limit = float(np.nanpercentile(np.abs(field), 98))
        if not np.isfinite(limit) or limit == 0:
            limit = 1.0
        options = {"cmap": "RdBu_r", "vmin": -limit, "vmax": limit}
    image = axes.pcolormesh(lon, lat, field, shading="auto", **options)
    figure.colorbar(image, ax=axes, orientation="horizontal", pad=0.08, shrink=0.85)
    axes.set(title=title, xlabel="longitude", ylabel="latitude")
    figure.tight_layout()
    figure.savefig(path, dpi=150)
    plt.close(figure)


def main() -> None:
    args = arguments()
    output_directory = Path(args.outdir)
    output_directory.mkdir(parents=True, exist_ok=True)

    device = torch.device(
        "cuda" if args.device == "auto" and torch.cuda.is_available() else args.device
    )
    timestamp = datetime.fromisoformat(args.date)

    from earth2studio.data import WB2ERA5
    from earth2studio.data.utils import fetch_data
    from earth2studio.models.dx import CBottleInfill

    variables = ["sst", "u10m", "v10m"]
    package = CBottleInfill.load_default_package()
    model = CBottleInfill.load_model(
        package,
        input_variables=variables,
        sampler_steps=args.sampler_steps,
        sigma_max=args.sigma_max,
    ).to(device)
    model.eval()

    # Work around the current Earth2Studio singleton-SST squeeze bug by using
    # two identical timestamps. Only sample zero is plotted and saved.
    times = np.array([timestamp, timestamp], dtype="datetime64[ns]")
    original, coords = fetch_data(WB2ERA5(), times, variables, device=device)

    sst_weight = anomaly_weight(
        coords, args.sst_shape, args.lat_min, args.lat_max, args.lon_min, args.lon_max
    )
    wind_weight = anomaly_weight(
        coords, args.wind_shape, args.lat_min, args.lat_max, args.lon_min, args.lon_max
    )

    modified = original.clone()
    modified = add_anomaly(modified, coords, "sst", args.delta_sst, sst_weight)
    modified = add_anomaly(modified, coords, "u10m", args.delta_u10m, wind_weight)
    modified = add_anomaly(modified, coords, "v10m", args.delta_v10m, wind_weight)

    print(f"device={device}, date={timestamp.isoformat()}")
    for name in variables:
        print_change(original, modified, coords, name)

    reset_seed(args.seed, model)
    baseline, output_coords = run_timed("baseline inference", lambda: model(original, coords))
    reset_seed(args.seed, model)
    changed, _ = run_timed("modified inference", lambda: model(modified, coords))

    lat = coordinate(output_coords, "lat")
    lon = coordinate(output_coords, "lon")
    available = set(output_coords["variable"])
    plot_variables = ["sst", "u10m", "v10m", "tcwv", "msl", "t2m"]

    for variable in plot_variables:
        if variable not in available:
            print(f"skip {variable}: unavailable")
            continue
        base_field = extract(baseline, output_coords, variable)
        changed_field = extract(changed, output_coords, variable)
        save_map(base_field, lat, lon, f"Baseline {variable}", output_directory / f"baseline_{variable}.png")
        save_map(changed_field, lat, lon, f"Modified {variable}", output_directory / f"modified_{variable}.png")
        save_map(
            changed_field - base_field,
            lat,
            lon,
            f"Difference {variable}",
            output_directory / f"diff_{variable}.png",
            difference=True,
        )

    if args.save_tensors:
        torch.save(
            {
                "date": timestamp.isoformat(),
                "delta_sst": args.delta_sst,
                "delta_u10m": args.delta_u10m,
                "delta_v10m": args.delta_v10m,
                "baseline": baseline[0].cpu(),
                "modified": changed[0].cpu(),
                "output_coords": {key: np.asarray(value) for key, value in output_coords.items()},
            },
            output_directory / "combined_slider.pt",
        )

    print("saved:", output_directory)


if __name__ == "__main__":
    main()
