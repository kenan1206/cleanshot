from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import HTMLResponse, FileResponse, RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import secrets
import hashlib
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="CleanU API")
api_router = APIRouter(prefix="/api")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Models ----------
class UserInit(BaseModel):
    device_id: str


class UserState(BaseModel):
    device_id: str
    is_premium: bool = False
    is_lifetime: bool = False
    trial_ends_at: Optional[str] = None
    plan: Optional[str] = None
    free_mb_used: float = 0.0
    free_photos_cleaned: int = 0
    free_video_compress_used: int = 0
    free_live_still_used: int = 0
    free_contacts_used: int = 0
    onboarded: bool = False
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class UsageUpdate(BaseModel):
    device_id: str
    photos_cleaned: int = 0
    mb_freed: float = 0.0
    category: Optional[str] = None


class FeatureUsage(BaseModel):
    device_id: str
    feature: str  # 'video_compress' | 'live_still'


class SubscribeRequest(BaseModel):
    device_id: str
    plan: str  # 'weekly' | 'lifetime'


class OnboardingComplete(BaseModel):
    device_id: str


class SessionRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    device_id: str
    category: str
    photos_cleaned: int
    mb_freed: float
    timestamp: str = Field(default_factory=now_iso)


class EventCreate(BaseModel):
    device_id: str
    event_name: str
    properties: Dict[str, Any] = Field(default_factory=dict)


class AdminLoginRequest(BaseModel):
    password: str

class AdminSetPremiumRequest(BaseModel):
    is_premium: bool
    plan: Optional[str] = None  # 'weekly' | 'lifetime' | None


# ---------- Constants ----------
FREE_MB_LIMIT = 100.0
FREE_PHOTOS_LIMIT = 50
FREE_TOOL_USES = 2  # video-compress & live-still: je 2 Gratis-Nutzungen

FEATURE_FIELDS = {
    "video_compress": "free_video_compress_used",
    "live_still": "free_live_still_used",
    "contacts": "free_contacts_used",
}

PLAN_PRICES = {
    "weekly": {"price": 4.99, "currency": "EUR", "period": "week", "trial_days": 7},
    "lifetime": {"price": 34.99, "currency": "EUR", "period": "lifetime"},
}

# ---------- Admin Auth ----------
ADMIN_PASSWORD_HASH = hashlib.sha256("Fener.1907".encode()).hexdigest()
ADMIN_TOKEN_EXPIRY_HOURS = 24

# In-memory token store {token: expires_at}
_admin_tokens: Dict[str, datetime] = {}

def _create_admin_token() -> str:
    token = secrets.token_urlsafe(32)
    _admin_tokens[token] = datetime.now(timezone.utc) + timedelta(hours=ADMIN_TOKEN_EXPIRY_HOURS)
    return token

def _validate_admin_token(token: str) -> bool:
    exp = _admin_tokens.get(token)
    if not exp:
        return False
    if datetime.now(timezone.utc) > exp:
        del _admin_tokens[token]
        return False
    return True

def _check_admin(request: Request) -> bool:
    token = request.cookies.get("cleanu_admin")
    return bool(token and _validate_admin_token(token))


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "CleanU API", "version": "1.0.0"}


@api_router.post("/users/init")
async def user_init(payload: UserInit):
    """Get or create user by device_id. Returns full state."""
    existing = await db.users.find_one({"device_id": payload.device_id}, {"_id": 0})
    if existing:
        return existing

    user = UserState(device_id=payload.device_id).dict()
    await db.users.insert_one(user.copy())
    return user


@api_router.get("/users/{device_id}")
async def get_user(device_id: str):
    user = await db.users.find_one({"device_id": device_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@api_router.post("/users/onboarding-complete")
async def onboarding_complete(payload: OnboardingComplete):
    await db.users.update_one(
        {"device_id": payload.device_id},
        {"$set": {"onboarded": True, "updated_at": now_iso()}},
        upsert=False,
    )
    user = await db.users.find_one({"device_id": payload.device_id}, {"_id": 0})
    return user


@api_router.post("/users/usage")
async def track_usage(payload: UsageUpdate):
    """Track cleaning usage. Enforces freemium limits on the frontend, but records here.
    Also records a session for history."""
    user = await db.users.find_one({"device_id": payload.device_id}, {"_id": 0})
    if not user:
        # Create on the fly so a missing/never-initialised device can never lose a
        # deletion (was raising 404 → frontend dropped the count + success screen).
        user = UserState(device_id=payload.device_id).dict()
        await db.users.insert_one(user.copy())

    # Update usage counters atomically ($inc) so concurrent/rapid deletes can never
    # lose a count (was a read-modify-write before → stale reads dropped deletions).
    # Only count against the free tier if the user is not premium.
    ops: Dict[str, Any] = {"$set": {"updated_at": now_iso()}}
    if not user.get("is_premium", False):
        ops["$inc"] = {
            "free_mb_used": float(payload.mb_freed),
            "free_photos_cleaned": int(payload.photos_cleaned),
        }

    await db.users.update_one(
        {"device_id": payload.device_id},
        ops,
    )

    # Record session
    session = SessionRecord(
        device_id=payload.device_id,
        category=payload.category or "mixed",
        photos_cleaned=payload.photos_cleaned,
        mb_freed=payload.mb_freed,
    ).dict()
    await db.sessions.insert_one(session.copy())

    updated_user = await db.users.find_one({"device_id": payload.device_id}, {"_id": 0})
    return {
        "user": updated_user,
        "free_limit_reached": (
            not updated_user.get("is_premium", False)
            and updated_user.get("free_mb_used", 0) >= FREE_MB_LIMIT
        ),
        "free_mb_limit": FREE_MB_LIMIT,
        "free_photos_limit": FREE_PHOTOS_LIMIT,
    }


@api_router.post("/users/feature-usage")
async def feature_usage(payload: FeatureUsage):
    """Track a use of a free-tier tool (video-compress / live-still).
    Non-premium users get FREE_TOOL_USES free uses each, then the paywall kicks in."""
    field = FEATURE_FIELDS.get(payload.feature)
    if not field:
        raise HTTPException(status_code=400, detail="Invalid feature")

    user = await db.users.find_one({"device_id": payload.device_id}, {"_id": 0})
    if not user:
        user = UserState(device_id=payload.device_id).dict()
        await db.users.insert_one(user.copy())

    if not user.get("is_premium", False):
        await db.users.update_one(
            {"device_id": payload.device_id},
            {"$inc": {field: 1}, "$set": {"updated_at": now_iso()}},
        )

    updated = await db.users.find_one({"device_id": payload.device_id}, {"_id": 0})
    used = int(updated.get(field, 0))
    return {
        "user": updated,
        "used": used,
        "limit": FREE_TOOL_USES,
        "limit_reached": (not updated.get("is_premium", False)) and used >= FREE_TOOL_USES,
    }


@api_router.get("/users/{device_id}/limits")
async def get_limits(device_id: str):
    user = await db.users.find_one({"device_id": device_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    is_premium = user.get("is_premium", False)
    mb_used = float(user.get("free_mb_used", 0))
    photos_used = int(user.get("free_photos_cleaned", 0))
    mb_remaining = max(0.0, FREE_MB_LIMIT - mb_used) if not is_premium else -1
    photos_remaining = max(0, FREE_PHOTOS_LIMIT - photos_used) if not is_premium else -1
    return {
        "is_premium": is_premium,
        "free_mb_limit": FREE_MB_LIMIT,
        "free_photos_limit": FREE_PHOTOS_LIMIT,
        "mb_used": mb_used,
        "photos_used": photos_used,
        "mb_remaining": mb_remaining,
        "photos_remaining": photos_remaining,
        "limit_reached": (not is_premium) and (mb_used >= FREE_MB_LIMIT),
    }


@api_router.post("/users/subscribe")
async def subscribe(payload: SubscribeRequest):
    """Mock subscribe endpoint (real StoreKit purchase happens on iOS build).
    Handles yearly, weekly (with 7-day free trial) and lifetime plans."""
    if payload.plan not in PLAN_PRICES:
        raise HTTPException(status_code=400, detail="Invalid plan")

    now = datetime.now(timezone.utc)
    update_fields: Dict[str, Any] = {
        "is_premium": True,
        "plan": payload.plan,
        "subscribed_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }

    if payload.plan == "weekly":
        trial_days = int(PLAN_PRICES["weekly"].get("trial_days", 0))
        update_fields["trial_ends_at"] = (now + timedelta(days=trial_days)).isoformat()
        update_fields["is_lifetime"] = False
    else:  # lifetime
        update_fields["is_lifetime"] = True
        update_fields["trial_ends_at"] = None

    await db.users.update_one(
        {"device_id": payload.device_id},
        {"$set": update_fields},
    )
    user = await db.users.find_one({"device_id": payload.device_id}, {"_id": 0})
    return {"user": user, "plan": PLAN_PRICES[payload.plan]}


@api_router.post("/users/restore")
async def restore(payload: UserInit):
    """Mock restore. Returns current subscription state."""
    user = await db.users.find_one({"device_id": payload.device_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"restored": bool(user.get("is_premium", False)), "user": user}


@api_router.post("/users/reset")
async def reset_user(payload: UserInit):
    """Dev/settings action: reset free counters (for testing)."""
    await db.users.update_one(
        {"device_id": payload.device_id},
        {"$set": {
            "free_mb_used": 0.0,
            "free_photos_cleaned": 0,
            "free_video_compress_used": 0,
            "free_live_still_used": 0,
            "free_contacts_used": 0,
            "is_premium": False,
            "is_lifetime": False,
            "trial_ends_at": None,
            "plan": None,
            "updated_at": now_iso(),
        }},
    )
    user = await db.users.find_one({"device_id": payload.device_id}, {"_id": 0})
    return user


@api_router.get("/sessions/{device_id}")
async def get_sessions(device_id: str, limit: int = 50):
    cursor = db.sessions.find({"device_id": device_id}, {"_id": 0}).sort("timestamp", -1).limit(limit)
    sessions = await cursor.to_list(length=limit)
    total_mb = sum(float(s.get("mb_freed", 0)) for s in sessions)
    total_photos = sum(int(s.get("photos_cleaned", 0)) for s in sessions)
    return {
        "sessions": sessions,
        "total_mb_freed": total_mb,
        "total_photos_cleaned": total_photos,
    }


@api_router.post("/events")
async def track_event(payload: EventCreate):
    """Analytics event (funnel + monetization)."""
    event = {
        "id": str(uuid.uuid4()),
        "device_id": payload.device_id,
        "event_name": payload.event_name,
        "properties": payload.properties,
        "timestamp": now_iso(),
    }
    await db.events.insert_one(event.copy())
    return {"ok": True}


@app.get("/logo.png", include_in_schema=False)
async def serve_logo():
    logo_path = Path(__file__).parent / "cleanu_logo.png"
    if logo_path.exists():
        return FileResponse(str(logo_path), media_type="image/png")
    return HTMLResponse("Not found", status_code=404)


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def landing_page():
    return HTMLResponse(content=f"""<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="application-name" content="CleanU">
<meta name="description" content="CleanU – iOS app to clean duplicate photos, junk emails and contacts. Free up gigabytes of storage in seconds.">
<meta name="google-site-verification" content="-q3xVd7wIOWYXHD_vH9lTop2mMT367ychrbd5kJ8Wbk" />
<meta property="og:title" content="CleanU">
<meta property="og:description" content="CleanU is an iOS app that cleans duplicate photos, junk emails and contacts to free up storage on your iPhone.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://cleanu.kenanplayer.com">
<script type="application/ld+json">
{{"@context":"https://schema.org","@type":"MobileApplication","name":"CleanU","operatingSystem":"iOS","applicationCategory":"UtilitiesApplication","description":"CleanU is an iOS app that cleans duplicate photos, junk emails and contacts to free up gigabytes of storage on your iPhone in seconds.","offers":{{"@type":"Offer","price":"0","priceCurrency":"EUR"}},"author":{{"@type":"Person","name":"Kenan Artiran"}},"url":"https://cleanu.kenanplayer.com"}}
</script>
<title>CleanU</title><style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #0A0C14; color: #fff; min-height: 100vh;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 40px 24px; text-align: center; }}
  .icon {{ width: 100px; height: 100px; border-radius: 26px;
           background: linear-gradient(135deg, #4F63FF, #6C4EF5, #5B3DE8);
           display: flex; align-items: center; justify-content: center;
           margin: 0 auto 28px; box-shadow: 0 16px 48px rgba(79,99,255,0.5); }}
  .icon svg {{ width: 52px; height: 52px; }}
  h1 {{ font-size: 2.4rem; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 12px; }}
  .tagline {{ font-size: 1.25rem; color: rgba(255,255,255,0.85); margin-bottom: 12px; font-weight: 600; }}
  .desc {{ font-size: 1rem; color: rgba(255,255,255,0.55); margin-bottom: 40px; line-height: 1.7; max-width: 520px; }}
  .features {{ background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
               border-radius: 16px; padding: 24px; margin-bottom: 40px; max-width: 520px; width: 100%; text-align: left; }}
  .feature {{ display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }}
  .feature:last-child {{ margin-bottom: 0; }}
  .feature-dot {{ width: 8px; height: 8px; border-radius: 50%; background: #4F63FF; flex-shrink: 0; }}
  .feature-text {{ font-size: 0.95rem; color: rgba(255,255,255,0.8); line-height: 1.4; }}
  .links {{ display: flex; gap: 24px; justify-content: center; flex-wrap: wrap; }}
  .links a {{ color: rgba(255,255,255,0.45); font-size: 0.875rem; text-decoration: none; }}
  .links a:hover {{ color: rgba(255,255,255,0.8); }}
  .footer {{ margin-top: 48px; color: rgba(255,255,255,0.25); font-size: 0.8rem; }}
</style></head><body>
<div class="icon">
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2 C12.5 7.5 15.5 10.5 22 12 C15.5 13.5 12.5 16.5 12 22 C11.5 16.5 8.5 13.5 2 12 C8.5 10.5 11.5 7.5 12 2 Z" fill="rgba(255,255,255,0.95)"/>
  </svg>
</div>
<h1>CleanU</h1>
<p class="tagline">Free up space in seconds</p>
<p class="desc">CleanU is an iOS app that helps you clean duplicate photos, junk emails, and redundant contacts — freeing up gigabytes of storage on your iPhone in seconds.</p>
<div class="features">
  <div class="feature"><div class="feature-dot"></div><div class="feature-text"><strong>Photo Cleaner</strong> — Detects and removes duplicate, similar, and blurry photos</div></div>
  <div class="feature"><div class="feature-dot"></div><div class="feature-text"><strong>Email Cleaner</strong> — Connects to Gmail to bulk-delete promotional and junk emails</div></div>
  <div class="feature"><div class="feature-dot"></div><div class="feature-text"><strong>Contact Manager</strong> — Finds and merges duplicate contacts automatically</div></div>
  <div class="feature"><div class="feature-dot"></div><div class="feature-text"><strong>Secret Library</strong> — Protects private photos with PIN and Face ID</div></div>
  <div class="feature"><div class="feature-dot"></div><div class="feature-text"><strong>100% On-Device</strong> — Your data never leaves your iPhone</div></div>
</div>
<div class="links">
  <a href="/privacy">Privacy Policy</a>
  <a href="/terms">Terms of Service</a>
  <a href="mailto:kenanveo1907@gmail.com">Contact / Support</a>
</div>
<div class="footer">CleanU &copy; 2026 Kenan Artiran &middot; iOS App &middot; <a href="mailto:kenanveo1907@gmail.com" style="color:rgba(255,255,255,0.25)">kenanveo1907@gmail.com</a></div>
</body></html>""")


@api_router.get("/plans")
async def get_plans():
    return {"plans": PLAN_PRICES, "free_mb_limit": FREE_MB_LIMIT, "free_photos_limit": FREE_PHOTOS_LIMIT}


@app.get("/api/screenshot-slide", response_class=HTMLResponse, include_in_schema=False)
async def screenshot_slide():
    html_path = Path(__file__).parent.parent / "frontend" / "assets" / "screenshot_slide.html"
    if html_path.exists():
        return HTMLResponse(content=html_path.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Not found</h1>", status_code=404)


@app.get("/api/screenshot-slide2", response_class=HTMLResponse, include_in_schema=False)
async def screenshot_slide2():
    html_path = Path(__file__).parent.parent / "frontend" / "assets" / "screenshot_slide2.html"
    if html_path.exists():
        return HTMLResponse(content=html_path.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Not found</h1>", status_code=404)


@app.get("/api/screenshot-slide5", response_class=HTMLResponse, include_in_schema=False)
async def screenshot_slide5():
    html_path = Path(__file__).parent.parent / "frontend" / "assets" / "screenshot_slide5.html"
    if html_path.exists():
        return HTMLResponse(content=html_path.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Not found</h1>", status_code=404)

@app.get("/api/download/slide5", include_in_schema=False)
async def download_slide5():
    png = Path(__file__).parent.parent / "frontend" / "assets" / "cleanu_slide5_4k.png"
    if png.exists():
        return FileResponse(str(png), media_type="image/png", filename="cleanu_slide5_kontakte.png")
    return HTMLResponse(content="Not found", status_code=404)


@app.get("/api/screenshot-slide4", response_class=HTMLResponse, include_in_schema=False)
async def screenshot_slide4():
    html_path = Path(__file__).parent.parent / "frontend" / "assets" / "screenshot_slide4.html"
    if html_path.exists():
        return HTMLResponse(content=html_path.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Not found</h1>", status_code=404)

@app.get("/api/download/slide4", include_in_schema=False)
async def download_slide4():
    png = Path(__file__).parent.parent / "frontend" / "assets" / "cleanu_slide4_4k.png"
    if png.exists():
        return FileResponse(str(png), media_type="image/png", filename="cleanu_slide4_videos.png")
    return HTMLResponse(content="Not found", status_code=404)


@app.get("/api/screenshot-slide3", response_class=HTMLResponse, include_in_schema=False)
async def screenshot_slide3():
    html_path = Path(__file__).parent.parent / "frontend" / "assets" / "screenshot_slide3.html"
    if html_path.exists():
        return HTMLResponse(content=html_path.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Not found</h1>", status_code=404)


@app.get("/api/download/slide3", include_in_schema=False)
async def download_slide3():
    png = Path(__file__).parent.parent / "frontend" / "assets" / "cleanu_slide3_4k.png"
    if png.exists():
        return FileResponse(str(png), media_type="image/png", filename="cleanu_slide3_chatfotos.png")
    return HTMLResponse(content="Not found", status_code=404)
async def download_slide1():
    png = Path(__file__).parent.parent / "frontend" / "assets" / "cleanu_slide1_4k.png"
    if png.exists():
        return FileResponse(str(png), media_type="image/png", filename="cleanu_slide1_1290x2796.png")
    return HTMLResponse(content="Not found", status_code=404)


@app.get("/api/download/slide2", include_in_schema=False)
async def download_slide2():
    png = Path(__file__).parent.parent / "frontend" / "assets" / "cleanu_slide2_4k.png"
    if png.exists():
        return FileResponse(str(png), media_type="image/png", filename="cleanu_slide2_1182x2802.png")
    return HTMLResponse(content="Not found", status_code=404)


app.include_router(api_router)


# ══════════════════════════════════════════════════════════════
#  ADMIN PANEL
# ══════════════════════════════════════════════════════════════

@app.post("/api/admin/login", include_in_schema=False)
async def admin_login(request: Request):
    import json as _json
    from urllib.parse import unquote_plus
    raw = await request.body()
    body_str = raw.decode("utf-8", errors="ignore")
    pw = ""
    ct = request.headers.get("content-type", "")
    if "application/json" in ct:
        try:
            pw = _json.loads(body_str).get("password", "")
        except Exception:
            pw = ""
    else:
        for part in body_str.split("&"):
            if part.startswith("password="):
                pw = unquote_plus(part[9:])
                break
    if hashlib.sha256(str(pw).encode()).hexdigest() != ADMIN_PASSWORD_HASH:
        return HTMLResponse(_admin_login_html(error=True), status_code=401)
    token = _create_admin_token()
    resp = RedirectResponse(url="/api/admin", status_code=303)
    resp.set_cookie("cleanu_admin", token, httponly=True, samesite="lax", max_age=86400)
    return resp


@app.get("/api/admin/logout", include_in_schema=False)
async def admin_logout():
    resp = RedirectResponse(url="/api/admin", status_code=303)
    resp.delete_cookie("cleanu_admin")
    return resp


@app.get("/api/admin", response_class=HTMLResponse, include_in_schema=False)
async def admin_dashboard(request: Request):
    if not _check_admin(request):
        return HTMLResponse(_admin_login_html())
    return HTMLResponse(_admin_dashboard_html())


# ── Admin API (JSON) ──────────────────────────────────────────

@app.get("/api/admin/stats", include_in_schema=False)
async def admin_stats(request: Request):
    if not _check_admin(request):
        raise HTTPException(status_code=401)
    total_users = await db.users.count_documents({})
    premium_users = await db.users.count_documents({"is_premium": True})
    lifetime_users = await db.users.count_documents({"is_lifetime": True})
    weekly_users = await db.users.count_documents({"plan": "weekly", "is_premium": True})
    # today activity
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    active_today = await db.users.count_documents({"updated_at": {"$gte": today_start}})
    # totals
    pipeline = [{"$group": {"_id": None, "total_mb": {"$sum": "$free_mb_used"}, "total_photos": {"$sum": "$free_photos_cleaned"}}}]
    agg = await db.users.aggregate(pipeline).to_list(1)
    total_mb = round(agg[0]["total_mb"], 1) if agg else 0
    total_photos = agg[0]["total_photos"] if agg else 0
    # total sessions
    total_sessions = await db.sessions.count_documents({})
    return {
        "total_users": total_users,
        "premium_users": premium_users,
        "lifetime_users": lifetime_users,
        "weekly_users": weekly_users,
        "free_users": total_users - premium_users,
        "active_today": active_today,
        "total_mb_freed": total_mb,
        "total_photos_cleaned": total_photos,
        "total_sessions": total_sessions,
    }


@app.get("/api/admin/users", include_in_schema=False)
async def admin_users(request: Request, page: int = 1, search: str = "", filter: str = "all"):
    if not _check_admin(request):
        raise HTTPException(status_code=401)
    limit = 25
    skip = (page - 1) * limit
    query: Dict[str, Any] = {}
    if search:
        query["device_id"] = {"$regex": search, "$options": "i"}
    if filter == "premium":
        query["is_premium"] = True
    elif filter == "free":
        query["is_premium"] = False
    elif filter == "lifetime":
        query["is_lifetime"] = True
    total = await db.users.count_documents(query)
    cursor = db.users.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    users = await cursor.to_list(length=limit)
    return {"users": users, "total": total, "page": page, "pages": max(1, (total + limit - 1) // limit)}


@app.post("/api/admin/users/{device_id}/premium", include_in_schema=False)
async def admin_set_premium(device_id: str, payload: AdminSetPremiumRequest, request: Request):
    if not _check_admin(request):
        raise HTTPException(status_code=401)
    now = datetime.now(timezone.utc)
    fields: Dict[str, Any] = {
        "is_premium": payload.is_premium,
        "updated_at": now.isoformat(),
    }
    if not payload.is_premium:
        fields.update({"plan": None, "is_lifetime": False, "trial_ends_at": None})
    else:
        plan = payload.plan or "lifetime"
        fields["plan"] = plan
        fields["is_lifetime"] = plan == "lifetime"
        if plan == "weekly":
            fields["trial_ends_at"] = (now + timedelta(days=7)).isoformat()
        else:
            fields["trial_ends_at"] = None
    await db.users.update_one({"device_id": device_id}, {"$set": fields})
    user = await db.users.find_one({"device_id": device_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.post("/api/admin/users/{device_id}/reset", include_in_schema=False)
async def admin_reset_user(device_id: str, request: Request):
    if not _check_admin(request):
        raise HTTPException(status_code=401)
    await db.users.update_one(
        {"device_id": device_id},
        {"$set": {
            "free_mb_used": 0.0, "free_photos_cleaned": 0,
            "free_video_compress_used": 0, "free_live_still_used": 0,
            "free_contacts_used": 0,
            "is_premium": False, "is_lifetime": False,
            "plan": None, "trial_ends_at": None,
            "updated_at": now_iso(),
        }},
    )
    return {"ok": True}


@app.get("/api/admin/sessions", include_in_schema=False)
async def admin_sessions(request: Request, limit: int = 50):
    if not _check_admin(request):
        raise HTTPException(status_code=401)
    cursor = db.sessions.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit)
    sessions = await cursor.to_list(length=limit)
    return {"sessions": sessions}


# ── Admin HTML Helpers ────────────────────────────────────────

def _admin_login_html(error: bool = False) -> str:
    err_html = '<p style="color:#FF3B30;font-size:0.875rem;margin-top:8px">Falsches Passwort</p>' if error else ""
    return f"""<!DOCTYPE html><html lang="de"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CleanU Admin</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F2F2F7;
        min-height:100vh;display:flex;align-items:center;justify-content:center}}
  .card{{background:#fff;border-radius:20px;padding:40px 36px;width:100%;max-width:380px;
         box-shadow:0 4px 24px rgba(0,0,0,0.08)}}
  .logo{{text-align:center;margin-bottom:28px}}
  .logo .icon{{width:64px;height:64px;background:linear-gradient(135deg,#4F63FF,#6C4EF5);
               border-radius:16px;display:inline-flex;align-items:center;justify-content:center;
               font-size:28px;margin-bottom:12px}}
  .logo h1{{font-size:1.5rem;font-weight:800;color:#000;letter-spacing:-0.5px}}
  .logo p{{color:#8E8E93;font-size:0.875rem;margin-top:4px}}
  label{{font-size:0.75rem;font-weight:600;color:#8E8E93;text-transform:uppercase;
          letter-spacing:0.5px;display:block;margin-bottom:6px;margin-top:16px}}
  input{{width:100%;padding:12px 14px;border:1.5px solid #E5E5EA;border-radius:12px;
         font-size:1rem;outline:none;transition:border-color 0.2s;background:#fff}}
  input:focus{{border-color:#007AFF}}
  button{{width:100%;margin-top:20px;padding:14px;background:#007AFF;color:#fff;border:none;
           border-radius:12px;font-size:1rem;font-weight:600;cursor:pointer}}
  button:active{{opacity:0.85}}
</style></head><body>
<div class="card">
  <div class="logo">
    <div class="icon">✦</div>
    <h1>CleanU Admin</h1>
    <p>Dashboard · Zugang</p>
  </div>
  <form method="POST" action="/api/admin/login">
    <label>Passwort</label>
    <input type="password" name="password" placeholder="&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;" autofocus autocomplete="current-password">
    {err_html}
    <button type="submit">Einloggen</button>
  </form>
</div>
</body></html>"""


def _admin_dashboard_html() -> str:
    return """<!DOCTYPE html><html lang="de"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CleanU Admin</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F2F2F7;color:#000;min-height:100vh}
  /* Sidebar */
  .sidebar{position:fixed;top:0;left:0;width:220px;height:100vh;background:#fff;
            border-right:1px solid #E5E5EA;padding:24px 0;z-index:100}
  .sidebar .brand{padding:0 20px 24px;border-bottom:1px solid #F2F2F7;margin-bottom:16px}
  .brand .icon{width:40px;height:40px;background:linear-gradient(135deg,#4F63FF,#6C4EF5);
                border-radius:10px;display:inline-flex;align-items:center;justify-content:center;
                font-size:18px;margin-bottom:8px}
  .brand h2{font-size:1rem;font-weight:800;color:#000}
  .brand p{font-size:0.75rem;color:#8E8E93;margin-top:2px}
  .nav-item{display:flex;align-items:center;gap:10px;padding:10px 20px;cursor:pointer;
             border-radius:10px;margin:2px 8px;font-size:0.9rem;font-weight:500;color:#3A3A3C;transition:all 0.15s}
  .nav-item:hover{background:#F2F2F7}
  .nav-item.active{background:#EEF2FF;color:#007AFF;font-weight:600}
  .nav-item .icon-sm{font-size:1.1rem;width:24px;text-align:center}
  .nav-divider{height:1px;background:#F2F2F7;margin:12px 8px}
  .logout-btn{position:absolute;bottom:24px;left:0;right:0;padding:0 8px}
  .logout-btn a{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;
                  color:#FF3B30;font-size:0.875rem;font-weight:500;text-decoration:none}
  .logout-btn a:hover{background:#FFF0EE}
  /* Main */
  .main{margin-left:220px;padding:32px}
  /* Header */
  .page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px}
  .page-title{font-size:1.75rem;font-weight:800;color:#000;letter-spacing:-0.5px}
  .page-sub{font-size:0.875rem;color:#8E8E93;margin-top:4px}
  /* Stats grid */
  .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}
  .stat-card{background:#fff;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.06)}
  .stat-card .label{font-size:0.75rem;font-weight:600;color:#8E8E93;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px}
  .stat-card .value{font-size:1.875rem;font-weight:800;color:#000;letter-spacing:-0.5px}
  .stat-card .sub{font-size:0.75rem;color:#8E8E93;margin-top:4px}
  .stat-card.blue .value{color:#007AFF}
  .stat-card.green .value{color:#34C759}
  .stat-card.purple .value{color:#AF52DE}
  /* Section */
  .section{background:#fff;border-radius:16px;box-shadow:0 1px 4px rgba(0,0,0,0.06);margin-bottom:24px}
  .section-header{padding:20px 24px;border-bottom:1px solid #F2F2F7;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .section-title{font-size:1rem;font-weight:700;color:#000}
  /* Search + Filter */
  .toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .search-input{padding:8px 14px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:0.875rem;
                 outline:none;width:220px;background:#F9F9F9}
  .search-input:focus{border-color:#007AFF;background:#fff}
  .filter-btn{padding:7px 14px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:0.8rem;
               font-weight:500;background:#F9F9F9;cursor:pointer;color:#3A3A3C}
  .filter-btn.active{background:#EEF2FF;border-color:#007AFF;color:#007AFF}
  /* Table */
  table{width:100%;border-collapse:collapse}
  th{padding:10px 16px;text-align:left;font-size:0.72rem;font-weight:600;color:#8E8E93;
      text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #F2F2F7}
  td{padding:12px 16px;border-bottom:1px solid #F9F9F9;font-size:0.875rem;color:#1C1C1E;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#FAFAFA}
  .did{font-family:monospace;font-size:0.78rem;color:#3A3A3C;background:#F2F2F7;
        padding:3px 8px;border-radius:6px;max-width:260px;overflow:hidden;
        text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:middle;cursor:pointer}
  .did:hover{background:#E5E5EA}
  /* Badges */
  .badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600}
  .badge.premium{background:#E8F9EE;color:#34C759}
  .badge.lifetime{background:#EEF2FF;color:#007AFF}
  .badge.weekly{background:#FFF3E0;color:#FF9500}
  .badge.free{background:#F2F2F7;color:#8E8E93}
  /* Action buttons */
  .action-btn{padding:5px 12px;border-radius:8px;font-size:0.78rem;font-weight:600;cursor:pointer;border:none;transition:all 0.15s}
  .action-btn.activate{background:#34C759;color:#fff}
  .action-btn.activate:hover{background:#2DB94D}
  .action-btn.deactivate{background:#FF3B30;color:#fff}
  .action-btn.deactivate:hover{background:#E0342A}
  .action-btn.reset{background:#F2F2F7;color:#8E8E93}
  .action-btn.reset:hover{background:#E5E5EA;color:#3A3A3C}
  .actions-cell{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  /* Plan select */
  .plan-select{padding:4px 8px;border:1.5px solid #E5E5EA;border-radius:8px;font-size:0.78rem;
                background:#fff;cursor:pointer;outline:none;color:#3A3A3C}
  /* Pagination */
  .pagination{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;
               border-top:1px solid #F2F2F7}
  .page-info{font-size:0.8rem;color:#8E8E93}
  .page-btns{display:flex;gap:8px}
  .page-btn{padding:6px 14px;border-radius:8px;border:1.5px solid #E5E5EA;font-size:0.8rem;
             font-weight:500;cursor:pointer;background:#fff;color:#3A3A3C}
  .page-btn:disabled{opacity:0.4;cursor:default}
  .page-btn:not(:disabled):hover{background:#F2F2F7}
  /* Toast */
  #toast{position:fixed;bottom:32px;right:32px;padding:12px 20px;border-radius:12px;
          background:#1C1C1E;color:#fff;font-size:0.875rem;font-weight:500;
          box-shadow:0 8px 24px rgba(0,0,0,0.2);z-index:999;
          opacity:0;transform:translateY(8px);transition:all 0.25s;pointer-events:none}
  #toast.show{opacity:1;transform:translateY(0)}
  /* Loading */
  .loading{text-align:center;padding:40px;color:#8E8E93;font-size:0.9rem}
  /* Page sections */
  .view{display:none}
  .view.active{display:block}
  /* Sessions */
  .session-row td:first-child{font-family:monospace;font-size:0.78rem;color:#8E8E93}
  /* Responsive */
  @media(max-width:900px){.stats-grid{grid-template-columns:repeat(2,1fr)}}
</style></head><body>

<!-- Sidebar -->
<div class="sidebar">
  <div class="brand">
    <div class="icon">✦</div>
    <h2>CleanU</h2>
    <p>Admin Dashboard</p>
  </div>
  <div class="nav-item active" onclick="showView('dashboard')" id="nav-dashboard">
    <span class="icon-sm">📊</span> Übersicht
  </div>
  <div class="nav-item" onclick="showView('users')" id="nav-users">
    <span class="icon-sm">👥</span> Nutzer
  </div>
  <div class="nav-item" onclick="showView('sessions')" id="nav-sessions">
    <span class="icon-sm">🧹</span> Sessions
  </div>
  <div class="nav-divider"></div>
  <div class="logout-btn">
    <a href="/api/admin/logout">
      <span style="font-size:1.1rem">🚪</span> Ausloggen
    </a>
  </div>
</div>

<!-- Main Content -->
<div class="main">

  <!-- DASHBOARD VIEW -->
  <div class="view active" id="view-dashboard">
    <div class="page-header">
      <div>
        <div class="page-title">Übersicht</div>
        <div class="page-sub" id="last-updated">Lade Daten...</div>
      </div>
      <button class="action-btn reset" onclick="loadStats()" style="padding:8px 16px">⟳ Aktualisieren</button>
    </div>
    <div class="stats-grid" id="stats-grid">
      <div class="stat-card"><div class="label">Gesamt Nutzer</div><div class="value" id="s-total">—</div><div class="sub">alle Geräte</div></div>
      <div class="stat-card green"><div class="label">Premium</div><div class="value" id="s-premium">—</div><div class="sub" id="s-premium-sub">—</div></div>
      <div class="stat-card blue"><div class="label">Heute aktiv</div><div class="value" id="s-active">—</div><div class="sub">geräte updated</div></div>
      <div class="stat-card purple"><div class="label">Cleaning-Sessions</div><div class="value" id="s-sessions">—</div><div class="sub">insgesamt</div></div>
      <div class="stat-card"><div class="label">Freemium</div><div class="value" id="s-free">—</div><div class="sub">noch nicht premium</div></div>
      <div class="stat-card blue"><div class="label">Lifetime</div><div class="value" id="s-lifetime">—</div><div class="sub">einmalig bezahlt</div></div>
      <div class="stat-card green"><div class="label">MB befreit</div><div class="value" id="s-mb">—</div><div class="sub">gesamt (free-tier)</div></div>
      <div class="stat-card"><div class="label">Fotos gelöscht</div><div class="value" id="s-photos">—</div><div class="sub">gesamt (free-tier)</div></div>
    </div>
  </div>

  <!-- USERS VIEW -->
  <div class="view" id="view-users">
    <div class="page-header">
      <div>
        <div class="page-title">Nutzer</div>
        <div class="page-sub" id="users-count-label">Lade...</div>
      </div>
    </div>
    <div class="section">
      <div class="section-header">
        <span class="section-title">Alle Geräte</span>
        <div class="toolbar">
          <input class="search-input" id="search-input" placeholder="🔍  Device ID suchen..." oninput="debounceSearch()" />
          <button class="filter-btn active" onclick="setFilter('all')" id="f-all">Alle</button>
          <button class="filter-btn" onclick="setFilter('premium')" id="f-premium">Premium</button>
          <button class="filter-btn" onclick="setFilter('free')" id="f-free">Gratis</button>
          <button class="filter-btn" onclick="setFilter('lifetime')" id="f-lifetime">Lifetime</button>
        </div>
      </div>
      <div id="users-table-wrap">
        <div class="loading">Lade Nutzer...</div>
      </div>
      <div class="pagination" id="users-pagination" style="display:none">
        <span class="page-info" id="pagination-info"></span>
        <div class="page-btns">
          <button class="page-btn" id="btn-prev" onclick="changePage(-1)" disabled>← Zurück</button>
          <button class="page-btn" id="btn-next" onclick="changePage(1)">Weiter →</button>
        </div>
      </div>
    </div>
  </div>

  <!-- SESSIONS VIEW -->
  <div class="view" id="view-sessions">
    <div class="page-header">
      <div>
        <div class="page-title">Cleaning-Sessions</div>
        <div class="page-sub">Letzte 50 Cleaning-Aktionen</div>
      </div>
      <button class="action-btn reset" onclick="loadSessions()" style="padding:8px 16px">⟳ Aktualisieren</button>
    </div>
    <div class="section">
      <table>
        <thead>
          <tr>
            <th>Zeit</th>
            <th>Device ID</th>
            <th>Kategorie</th>
            <th>Fotos</th>
            <th>MB</th>
          </tr>
        </thead>
        <tbody id="sessions-body">
          <tr><td colspan="5" class="loading">Lade Sessions...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

</div>

<!-- Toast -->
<div id="toast"></div>

<script>
// ─── State ───────────────────────────────────────────────────
let currentPage = 1;
let currentFilter = 'all';
let searchQuery = '';
let totalPages = 1;
let searchTimer = null;

// ─── Navigation ──────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  if (name === 'dashboard') loadStats();
  if (name === 'users') { currentPage = 1; loadUsers(); }
  if (name === 'sessions') loadSessions();
}
// ─── Toast ───────────────────────────────────────────────────
function toast(msg, ok = true) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = ok ? '#1C1C1E' : '#FF3B30';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

// ─── Stats ───────────────────────────────────────────────────
async function loadStats() {
  try {
    const r = await fetch('/api/admin/stats');
    const d = await r.json();
    document.getElementById('s-total').textContent = d.total_users;
    document.getElementById('s-premium').textContent = d.premium_users;
    document.getElementById('s-premium-sub').textContent = `${d.weekly_users} weekly · ${d.lifetime_users} lifetime`;
    document.getElementById('s-active').textContent = d.active_today;
    document.getElementById('s-sessions').textContent = d.total_sessions;
    document.getElementById('s-free').textContent = d.free_users;
    document.getElementById('s-lifetime').textContent = d.lifetime_users;
    document.getElementById('s-mb').textContent = d.total_mb_freed + ' MB';
    document.getElementById('s-photos').textContent = d.total_photos_cleaned.toLocaleString();
    document.getElementById('last-updated').textContent = 'Zuletzt: ' + new Date().toLocaleTimeString('de-DE');
  } catch(e) { toast('Fehler beim Laden', false); }
}

// ─── Users ───────────────────────────────────────────────────
function debounceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { currentPage = 1; loadUsers(); }, 350);
}

function setFilter(f) {
  currentFilter = f;
  currentPage = 1;
  ['all','premium','free','lifetime'].forEach(x => {
    document.getElementById('f-' + x).classList.toggle('active', x === f);
  });
  loadUsers();
}

function changePage(dir) {
  currentPage = Math.max(1, Math.min(totalPages, currentPage + dir));
  loadUsers();
}

async function loadUsers() {
  searchQuery = document.getElementById('search-input').value.trim();
  const url = `/api/admin/users?page=${currentPage}&search=${encodeURIComponent(searchQuery)}&filter=${currentFilter}`;
  document.getElementById('users-table-wrap').innerHTML = '<div class="loading">Lade Nutzer...</div>';
  try {
    const r = await fetch(url);
    const d = await r.json();
    totalPages = d.pages;
    document.getElementById('users-count-label').textContent = d.total + ' Nutzer gefunden';
    renderUsersTable(d.users);
    renderPagination(d.total, d.page, d.pages);
  } catch(e) { toast('Fehler beim Laden der Nutzer', false); }
}

function renderUsersTable(users) {
  if (!users.length) {
    document.getElementById('users-table-wrap').innerHTML = '<div class="loading">Keine Nutzer gefunden</div>';
    document.getElementById('users-pagination').style.display = 'none';
    return;
  }
  const rows = users.map(u => {
    const isPremium = u.is_premium;
    const badge = isPremium
      ? (u.is_lifetime ? '<span class="badge lifetime">⭐ Lifetime</span>' : '<span class="badge weekly">🔄 Weekly</span>')
      : '<span class="badge free">Gratis</span>';
    const joined = u.created_at ? new Date(u.created_at).toLocaleDateString('de-DE') : '—';
    const mb = (u.free_mb_used || 0).toFixed(1);
    const photos = u.free_photos_cleaned || 0;
    const toggleBtn = isPremium
      ? `<button class="action-btn deactivate" onclick="setPremium('${u.device_id}', false, null)">⛔ Deaktivieren</button>`
      : `<select class="plan-select" id="plan-${u.device_id.replace(/[^a-z0-9]/gi,'_')}">
           <option value="lifetime">Lifetime</option>
           <option value="weekly">Weekly</option>
         </select>
         <button class="action-btn activate" onclick="setPremiumWithPlan('${u.device_id}')">✓ Aktivieren</button>`;
    return `<tr>
      <td><span class="did" title="Klick zum Kopieren: ${u.device_id}" onclick="copyId('${u.device_id}')">${u.device_id}</span></td>
      <td>${badge}</td>
      <td>${photos}</td>
      <td>${mb} MB</td>
      <td>${joined}</td>
      <td><div class="actions-cell">
        ${toggleBtn}
        <button class="action-btn reset" onclick="resetUser('${u.device_id}')">↺ Reset</button>
      </div></td>
    </tr>`;
  }).join('');
  document.getElementById('users-table-wrap').innerHTML = `
    <table>
      <thead><tr>
        <th>Device ID</th><th>Status</th><th>Fotos</th><th>MB</th><th>Beigetreten</th><th>Aktionen</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderPagination(total, page, pages) {
  const pag = document.getElementById('users-pagination');
  if (pages <= 1) { pag.style.display = 'none'; return; }
  pag.style.display = 'flex';
  document.getElementById('pagination-info').textContent = `Seite ${page} von ${pages} (${total} Nutzer)`;
  document.getElementById('btn-prev').disabled = page <= 1;
  document.getElementById('btn-next').disabled = page >= pages;
}

function setPremiumWithPlan(deviceId) {
  const safeId = deviceId.replace(/[^a-z0-9]/gi,'_');
  const sel = document.getElementById('plan-' + safeId);
  const plan = sel ? sel.value : 'lifetime';
  setPremium(deviceId, true, plan);
}

async function setPremium(deviceId, isPremium, plan) {
  try {
    const r = await fetch(`/api/admin/users/${encodeURIComponent(deviceId)}/premium`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({is_premium: isPremium, plan: plan})
    });
    if (!r.ok) throw new Error();
    const u = await r.json();
    const status = isPremium ? (plan === 'lifetime' ? 'Lifetime Premium' : 'Weekly Premium') : 'Gratis';
    toast(`✓ ${deviceId.substring(0,16)}… → ${status}`);
    loadUsers();
  } catch(e) { toast('Fehler beim Setzen', false); }
}

async function resetUser(deviceId) {
  if (!confirm(`Zähler zurücksetzen für\\n${deviceId}?`)) return;
  try {
    await fetch(`/api/admin/users/${encodeURIComponent(deviceId)}/reset`, {method:'POST'});
    toast('✓ Komplett zurückgesetzt (Premium + Zähler)');
    loadUsers();
  } catch(e) { toast('Fehler', false); }
}

// ─── Sessions ────────────────────────────────────────────────
async function loadSessions() {
  try {
    const r = await fetch('/api/admin/sessions?limit=50');
    const d = await r.json();
    const body = document.getElementById('sessions-body');
    if (!d.sessions.length) {
      body.innerHTML = '<tr><td colspan="5" class="loading">Keine Sessions</td></tr>';
      return;
    }
    body.innerHTML = d.sessions.map(s => {
      const t = s.timestamp ? new Date(s.timestamp).toLocaleString('de-DE') : '—';
      const shortId = (s.device_id || '').substring(0, 26) + '…';
      return `<tr class="session-row">
        <td>${t}</td>
        <td><span class="did" title="${s.device_id}">${shortId}</span></td>
        <td>${s.category || '—'}</td>
        <td>${s.photos_cleaned || 0}</td>
        <td>${(s.mb_freed || 0).toFixed(1)} MB</td>
      </tr>`;
    }).join('');
  } catch(e) { toast('Fehler beim Laden der Sessions', false); }
}

// ─── Copy ID ─────────────────────────────────────────────────
function copyId(id) {
  navigator.clipboard.writeText(id).then(() => toast('✓ ID kopiert: ' + id.substring(0,16) + '…'));
}

// ─── Init ────────────────────────────────────────────────────
loadStats();
</script>
</body></html>"""


# ── Public Legal Pages (für Google OAuth Verification) ──────────────────────

_LEGAL_STYLE = """
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         max-width: 800px; margin: 0 auto; padding: 40px 24px; color: #1a1a1a; line-height: 1.7; }
  h1 { font-size: 2rem; font-weight: 800; margin-bottom: 4px; letter-spacing: -0.5px; }
  .meta { color: #888; font-size: 0.875rem; margin-bottom: 40px; }
  h2 { font-size: 1rem; font-weight: 700; color: #4F63FF; text-transform: uppercase;
       letter-spacing: 0.5px; margin-top: 32px; margin-bottom: 6px; }
  p { margin: 0 0 12px; color: #333; }
  .footer { margin-top: 56px; padding-top: 24px; border-top: 1px solid #eee;
            color: #aaa; font-size: 0.8rem; text-align: center; }
  a { color: #4F63FF; }
"""

@app.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
async def privacy_policy():
    return HTMLResponse(content=f"""<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CleanU – Privacy Policy</title><style>{_LEGAL_STYLE}</style></head><body>
<h1>Privacy Policy</h1>
<p class="meta">Last updated: August 2026 &nbsp;·&nbsp; CleanU by Kenan Artiran</p>

<h2>1. Overview</h2>
<p>CleanU is an iOS app for cleaning photos, contacts, and emails. We built it with privacy as a core principle. Your photos, videos, contacts, and emails <strong>never leave your device</strong>. We do not collect personally identifiable information.</p>

<h2>2. Data We Collect</h2>
<p>We collect only: an anonymous device ID (randomly generated, not linked to you personally), usage counters (number of photos deleted, MB freed — no content), and anonymous app events (e.g. "scan started") for analytics. We never collect names, email addresses, photo content, video content, or other personal data.</p>

<h2>3. Photos &amp; Media Library</h2>
<p>CleanU requires access to your photo library to detect duplicates, screenshots, and similar photos. All analysis is performed <strong>locally on your device</strong>. No photo or video is ever transmitted to, stored on, or analyzed by external servers.</p>

<h2>4. Gmail &amp; Email (Google API)</h2>
<p>When you use the Email Cleaner feature, you connect your Google account via OAuth 2.0. CleanU requests the <code>gmail.modify</code> scope to read email metadata (sender, subject, labels) and move selected emails to trash on your behalf.</p>
<p><strong>Your Gmail tokens are stored exclusively on your device</strong> (in the iOS Keychain). CleanU's backend servers never receive, store, or process your Gmail tokens, email content, or any Google account data. All Gmail API calls are made directly from your device.</p>
<p>CleanU's use of Google user data complies with the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>

<h2>5. Contacts</h2>
<p>The Contacts Manager reads your contacts locally to detect duplicates and incomplete entries. Contact data is never transmitted to servers or permanently stored outside your device.</p>

<h2>6. Secret Library</h2>
<p>Photos and videos stored in the Secret Library are saved exclusively in your app's protected local documents folder. They never leave your device. The PIN is stored in the iOS Keychain.</p>

<h2>7. In-App Purchases</h2>
<p>Payments for CleanU Premium are handled entirely by Apple's StoreKit. We do not receive payment data, credit card information, or other financial information.</p>

<h2>8. Third Parties</h2>
<p>We do not use external tracking SDKs (no Facebook, Google Analytics, Firebase, etc.). Our only external connection is the CleanU backend server for anonymous usage statistics and Premium status management.</p>

<h2>9. Data Retention &amp; Deletion</h2>
<p>Anonymous usage data is stored on our server for up to 12 months. Uninstalling the app removes all local data from your device. To request complete server-side deletion, contact us at the email below.</p>

<h2>10. Contact</h2>
<p>For privacy inquiries: <a href="mailto:kenanveo1907@gmail.com">kenanveo1907@gmail.com</a><br>
Kenan Artiran · <a href="https://kenanplayer.com">kenanplayer.com</a></p>

<div class="footer">CleanU &copy; 2026 Kenan Artiran &nbsp;·&nbsp;
<a href="/terms">Terms of Service</a></div>
</body></html>""")


@app.get("/terms", response_class=HTMLResponse, include_in_schema=False)
async def terms_of_service():
    return HTMLResponse(content=f"""<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CleanU – Terms of Service</title><style>{_LEGAL_STYLE}</style></head><body>
<h1>Terms of Service</h1>
<p class="meta">Last updated: August 2026 &nbsp;·&nbsp; CleanU by Kenan Artiran</p>

<h2>1. About CleanU</h2>
<p>CleanU is an iOS app for cleaning photos, contacts, and emails, developed by Kenan Artiran. The app runs entirely on your device — no data is uploaded to our servers.</p>

<h2>2. Free Version</h2>
<p>The free version allows you to free up to 50 photos or 100 MB of storage. After reaching this limit, an upgrade to CleanU Premium is required to perform further photo cleanups. The Email Cleaner, Contacts, and Secret Library features are unlimited in the free plan.</p>

<h2>3. CleanU Premium</h2>
<p>Premium is available as a weekly subscription (€4.99/week, 7-day free trial) or a one-time Lifetime payment (€34.99). The trial begins immediately and automatically renews into a paid subscription unless cancelled at least 24 hours before the trial ends. Payments are processed by Apple and will appear on your iTunes account statements. Subscriptions can be cancelled at any time via iOS Settings → Apple ID → Subscriptions.</p>

<h2>4. Restoring Purchases</h2>
<p>If you have previously purchased Premium, you can restore it on the same device or with the same Apple ID using the "Restore Purchases" feature in the app settings at no charge.</p>

<h2>5. Acceptable Use</h2>
<p>You agree to use the app only for lawful purposes. You may not reverse-engineer, modify, or redistribute the app for commercial purposes. We reserve the right to modify or discontinue the service at any time.</p>

<h2>6. Disclaimer</h2>
<p>CleanU is not liable for accidentally deleted photos or data. Please ensure you have a backup of important content before performing any cleanups. The app is provided "as is" without any warranties.</p>

<h2>7. Changes</h2>
<p>We may update these Terms of Service at any time. Material changes will be communicated within the app. Continued use of the app constitutes acceptance of the updated terms.</p>

<h2>8. Contact</h2>
<p>For questions or issues: <a href="mailto:kenanveo1907@gmail.com">kenanveo1907@gmail.com</a><br>
Kenan Artiran · <a href="https://kenanplayer.com">kenanplayer.com</a></p>

<div class="footer">CleanU &copy; 2026 Kenan Artiran &nbsp;·&nbsp;
<a href="/privacy">Privacy Policy</a></div>
</body></html>""")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
