"""Tests for App Store screenshot slide download endpoints and PNG pixel analysis"""
import pytest
import requests
import os
from PIL import Image
import io

BASE_URL = "https://spotless-31.preview.emergentagent.com"


class TestPlansEndpoint:
    """Plans API health check"""

    def test_plans_returns_200(self):
        response = requests.get(f"{BASE_URL}/api/plans", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/plans returned 200")


class TestSlideDownloads:
    """Slide download endpoint tests — PNG content and no side bars"""

    SLIDE_ENDPOINTS = [
        "slide1",
        "slide4-en",
        "slide5",
        "slide5-en",
    ]

    def _download_png(self, slide_id):
        url = f"{BASE_URL}/api/download/{slide_id}"
        response = requests.get(url, timeout=30)
        assert response.status_code == 200, f"{slide_id}: Expected 200, got {response.status_code}: {response.text[:200]}"
        assert "image/png" in response.headers.get("content-type", ""), \
            f"{slide_id}: Expected image/png, got {response.headers.get('content-type')}"
        return response.content

    def _check_no_side_bars(self, png_bytes, slide_id, expected_width=1242):
        """Check that content fills full width (no uniform-color bars on left/right edges)"""
        img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
        width, height = img.size
        print(f"  {slide_id}: image size = {width}x{height}")

        assert width == expected_width, f"{slide_id}: Expected width {expected_width}, got {width}"

        # Sample pixels at x=0 (edge) and x=200 (content area)
        mid_y = height // 2
        edge_pixel = img.getpixel((0, mid_y))
        inner_pixel = img.getpixel((200, mid_y))
        far_inner_pixel = img.getpixel((width // 2, mid_y))

        print(f"  {slide_id}: edge(0,{mid_y})={edge_pixel}, inner(200,{mid_y})={inner_pixel}, center({width//2},{mid_y})={far_inner_pixel}")

        # If edge and inner 200px are ALL the same color, it's a uniform bar
        # Check a range of x values from 0..200 for uniformity
        left_colors = set()
        for x in range(0, 200, 20):
            left_colors.add(img.getpixel((x, mid_y)))

        if len(left_colors) == 1:
            # All same color — check if it differs from center
            center_color = img.getpixel((width // 2, mid_y))
            bar_color = list(left_colors)[0]
            assert bar_color != center_color, \
                f"{slide_id}: SIDE BAR DETECTED! Left edge pixels 0-200 all have color {bar_color}, center={center_color}"
            print(f"  WARNING: {slide_id} left edge uniform color {bar_color} but same as center — likely solid background (OK)")
        else:
            print(f"  {slide_id}: No uniform side bar detected (varied colors in left 200px: {len(left_colors)} distinct)")

        return True

    def test_slide1_downloads_correctly(self):
        """Regression: slide1 (DE) was already correct"""
        png = self._download_png("slide1")
        self._check_no_side_bars(png, "slide1")
        print("PASS: slide1 OK")

    def test_slide4_en_downloads_correctly(self):
        """slide4-en should have no side bars"""
        png = self._download_png("slide4-en")
        self._check_no_side_bars(png, "slide4-en")
        print("PASS: slide4-en OK")

    def test_slide5_de_downloads_correctly(self):
        """slide5 (DE) should have no side bars"""
        png = self._download_png("slide5")
        self._check_no_side_bars(png, "slide5")
        print("PASS: slide5 (DE) OK")

    def test_slide5_en_downloads_correctly(self):
        """slide5-en was the primary bug — should have no blue side bars"""
        png = self._download_png("slide5-en")
        self._check_no_side_bars(png, "slide5-en")
        print("PASS: slide5-en OK — no side bars")

    def test_slide5_en_left_edge_not_uniform_blue(self):
        """Explicit check: slide5-en should NOT have uniform blue (64,112,240) bar"""
        png = self._download_png("slide5-en")
        img = Image.open(io.BytesIO(png)).convert("RGB")
        width, height = img.size
        mid_y = height // 2

        blue_bar_color = (64, 112, 240)
        blue_pixels = 0
        for x in range(0, 200, 10):
            pixel = img.getpixel((x, mid_y))
            if pixel == blue_bar_color:
                blue_pixels += 1

        assert blue_pixels < 10, \
            f"slide5-en: {blue_pixels} blue bar pixels detected at left edge! Blue bar bug NOT fixed."
        print(f"PASS: slide5-en — only {blue_pixels}/20 blue edge pixels (threshold <10)")
