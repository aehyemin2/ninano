from array import array

from fastapi.testclient import TestClient

from server.app import DATA_ROOT, app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["dataReady"] is True


def test_metadata() -> None:
    response = client.get("/api/v1/enso/metadata")
    assert response.status_code == 200
    assert response.json()["dtype"] == "float32"


def test_scalar_layer_is_sent_unchanged() -> None:
    response = client.get(
        "/api/v1/enso/layers/sst",
        params={"sst_anomaly": "0.0", "wind_delta": "0"},
    )
    source = DATA_ROOT / "sst" / "sst_0.0_wind_0.f32"
    assert response.status_code == 200
    assert len(response.content) == source.stat().st_size
    assert response.headers["x-buffer-dtype"] == "float32"


def test_invalid_slider_step_is_rejected() -> None:
    response = client.get(
        "/api/v1/enso/layers/sst",
        params={"sst_anomaly": "1.21", "wind_delta": "0"},
    )
    assert response.status_code == 422


def test_planar_wind_has_u_then_v_without_changing_size() -> None:
    response = client.get(
        "/api/v1/enso/layers/wind",
        params={"sst_anomaly": "0.0", "wind_delta": "0", "layout": "planar"},
    )
    source_path = DATA_ROOT / "wind" / "sst_0.0_wind_0.f32"
    source = array("f")
    source.frombytes(source_path.read_bytes())
    planar = array("f")
    planar.frombytes(response.content)
    field_size = len(source) // 2

    assert response.status_code == 200
    assert len(response.content) == source_path.stat().st_size
    assert response.headers["x-wind-layout"] == "component_lat_lon"
    assert planar[0:3] == source[0:3]
    assert planar[field_size:field_size + 3] == source[field_size:field_size + 3]


def test_unknown_layer_is_rejected() -> None:
    response = client.get(
        "/api/v1/enso/layers/not-a-layer",
        params={"sst_anomaly": "0.0", "wind_delta": "0"},
    )
    assert response.status_code == 404
