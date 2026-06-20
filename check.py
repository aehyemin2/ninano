import xarray as xr

ds = xr.open_dataset("output.nc")

print(ds)
print(ds.data_vars)
print(ds.coords)


import matplotlib.pyplot as plt

ds["t2m"].isel(time=0, lead_time=-1).plot()
plt.show()