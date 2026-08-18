from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
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


app.include_router(api_router)


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
