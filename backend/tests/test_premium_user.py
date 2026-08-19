"""
Tests for premium user verification on Hetzner and Pod backends.
Verifies that device_id 72F100B5-0DC1-44B1-809E-82D34CBE7F3C returns is_premium: true
"""
import pytest
import requests

HETZNER_URL = "https://cleanu.kenanplayer.com"
POD_URL = "https://spotless-31.preview.emergentagent.com"
DEVICE_ID = "72F100B5-0DC1-44B1-809E-82D34CBE7F3C"


class TestHetznerBackend:
    """Tests against the Hetzner production backend"""

    def test_hetzner_health(self):
        try:
            r = requests.get(f"{HETZNER_URL}/api/health", timeout=10)
            print(f"Hetzner health status: {r.status_code} - {r.text[:200]}")
            assert r.status_code in [200, 404], f"Hetzner backend unreachable: {r.status_code}"
        except requests.exceptions.RequestException as e:
            pytest.skip(f"Hetzner backend unreachable: {e}")

    def test_hetzner_user_init_returns_premium(self):
        """POST /api/users/init with known premium device_id should return is_premium: true"""
        try:
            r = requests.post(
                f"{HETZNER_URL}/api/users/init",
                json={"device_id": DEVICE_ID},
                timeout=10
            )
            print(f"POST /api/users/init status: {r.status_code}")
            print(f"Response: {r.text[:500]}")
            assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
            data = r.json()
            assert data.get("is_premium") == True, f"Expected is_premium=true, got: {data}"
            print("PASS: is_premium=true confirmed on Hetzner via POST /api/users/init")
        except requests.exceptions.RequestException as e:
            pytest.skip(f"Hetzner backend unreachable: {e}")

    def test_hetzner_get_user_premium_and_lifetime(self):
        """GET /api/users/{device_id} should return is_premium: true and is_lifetime: true"""
        try:
            r = requests.get(
                f"{HETZNER_URL}/api/users/{DEVICE_ID}",
                timeout=10
            )
            print(f"GET /api/users/{DEVICE_ID} status: {r.status_code}")
            print(f"Response: {r.text[:500]}")
            assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
            data = r.json()
            assert data.get("is_premium") == True, f"Expected is_premium=true, got: {data}"
            assert data.get("is_lifetime") == True, f"Expected is_lifetime=true, got: {data}"
            print("PASS: is_premium=true, is_lifetime=true confirmed on Hetzner")
        except requests.exceptions.RequestException as e:
            pytest.skip(f"Hetzner backend unreachable: {e}")


class TestPodBackend:
    """Tests against the pod preview backend (spotless-31)"""

    def test_pod_user_init_returns_premium(self):
        """POST /api/users/init on pod should also return is_premium: true for same device"""
        try:
            r = requests.post(
                f"{POD_URL}/api/users/init",
                json={"device_id": DEVICE_ID},
                timeout=10
            )
            print(f"[Pod] POST /api/users/init status: {r.status_code}")
            print(f"[Pod] Response: {r.text[:500]}")
            assert r.status_code == 200, f"Expected 200, got {r.status_code}"
            data = r.json()
            assert data.get("is_premium") == True, f"Expected is_premium=true, got: {data}"
            print("PASS: is_premium=true confirmed on Pod backend")
        except requests.exceptions.RequestException as e:
            pytest.skip(f"Pod backend unreachable: {e}")

    def test_pod_get_user_premium_and_lifetime(self):
        """GET /api/users/{device_id} on pod should return is_premium: true, is_lifetime: true"""
        try:
            r = requests.get(
                f"{POD_URL}/api/users/{DEVICE_ID}",
                timeout=10
            )
            print(f"[Pod] GET /api/users/{DEVICE_ID} status: {r.status_code}")
            print(f"[Pod] Response: {r.text[:500]}")
            assert r.status_code == 200, f"Expected 200, got {r.status_code}"
            data = r.json()
            assert data.get("is_premium") == True, f"Expected is_premium=true, got: {data}"
            assert data.get("is_lifetime") == True, f"Expected is_lifetime=true, got: {data}"
            print("PASS: is_premium=true, is_lifetime=true confirmed on Pod backend")
        except requests.exceptions.RequestException as e:
            pytest.skip(f"Pod backend unreachable: {e}")


class TestEnvConfig:
    """Verify environment configuration"""

    def test_frontend_env_has_correct_backend_url(self):
        """frontend/.env EXPO_PUBLIC_BACKEND_URL should point to cleanu.kenanplayer.com"""
        import os
        env_path = "/app/frontend/.env"
        with open(env_path) as f:
            content = f.read()
        print(f"frontend/.env content:\n{content}")
        # Check what URL is set
        for line in content.splitlines():
            if "EXPO_PUBLIC_BACKEND_URL" in line:
                print(f"Found: {line}")
                assert "cleanu.kenanplayer.com" in line, (
                    f"EXPO_PUBLIC_BACKEND_URL should point to cleanu.kenanplayer.com but got: {line}"
                )
                return
        pytest.fail("EXPO_PUBLIC_BACKEND_URL not found in frontend/.env")
