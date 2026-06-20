import xarray as xr

data = xr.open_dataarray("difference.nc")

variables = data.coords["variable"].values.tolist()

print("변수 개수:", len(variables))

for variable in variables:
    print(variable)