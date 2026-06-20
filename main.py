from earth2studio.models.px import DLWP
from earth2studio.data import GFS
from earth2studio.io import NetCDF4Backend
from earth2studio.run import deterministic as run

model = DLWP.load_model(DLWP.load_default_package())
ds = GFS()
io = NetCDF4Backend("output.nc")

run(["2024-01-01"], 10, model, ds, io)