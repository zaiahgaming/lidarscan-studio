from fastapi.testclient import TestClient
from server.main import app

client = TestClient(app)

def test_api_ping():
    response = client.get("/api/ping")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "LidarScan Studio"
    assert data["version"] == 1


def test_api_status():
    response = client.get("/api/status")
    assert response.status_code == 200
    data = response.json()
    assert "colab_cli" in data
    assert "lan_ip" in data
    assert "port" in data


def test_api_captures():
    response = client.get("/api/captures")
    assert response.status_code == 200
    captures = response.json()
    assert isinstance(captures, list)
