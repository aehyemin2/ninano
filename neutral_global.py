import matplotlib

matplotlib.use("Agg")

import cartopy.crs as ccrs
import matplotlib.pyplot as plt
import xarray as xr

path = "neutral_2013-12-15.nc"
data = xr.open_dataarray(path)

print(data)
print("변수:", data.variable.values)

# 수증기량 선택
tcwv = data.sel(variable="tcwv").isel(time=0)

fig = plt.figure(figsize=(16, 8))
ax = plt.axes(projection=ccrs.Robinson())

image = ax.pcolormesh(
    data.lon,
    data.lat,
    tcwv,
    transform=ccrs.PlateCarree(),
    shading="auto",
    cmap="turbo",
)

ax.coastlines()
ax.gridlines()
ax.set_global()
ax.set_title("cBottle ENSO Neutral — TCWV — 2013-12-15")

colorbar = plt.colorbar(
    image,
    ax=ax,
    orientation="horizontal",
    pad=0.05,
    shrink=0.8,
)

colorbar.set_label("Total Column Water Vapor")

plt.savefig(
    "neutral_global_tcwv.png",
    dpi=150,
    bbox_inches="tight",
)

print("지도 저장 완료: neutral_global_tcwv.png")