# CleanU — Agent Handoff PRD
**Stand: Feb 2026 · Pod: spotless-app-40 (aktuelle Umgebung)**

---

## Projekt-Überblick
CleanU ist ein iOS-Foto/Speicher-Cleaner (Bestseller-Klon + besser).
- Expo SDK 54, React Native, FastAPI, MongoDB
- 5 Tabs: Start | E-Mail | Kontakte | Optimieren | Extras

## Zugänge
| Was | Wert |
|-----|------|
| GitHub | https://github.com/kenan1206/cleanshot |
| GitHub PAT | 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 |
| Hetzner SSH | root@46.62.205.112 PW: VEPEvj7Tkwnc |
| Emergent LLM Key | sk-emergent-eA1F6B5338250281a1 |
| Prod Backend | https://cleanu.kenanplayer.com |
| Emergent Preview | https://spotless-app-40.preview.emergentagent.com |
| Bundle-ID | com.kenanplayer.cleanu |

## Architektur
- Frontend: /app/frontend (Expo SDK 54, expo-router, 5 Tabs)
- Backend: /app/backend/server.py (FastAPI, Motor, MongoDB)
- Prod: Hetzner Docker (cleanshot-api + cleanshot-mongo)

## Implementiert (Live)
- Photo-Scan (9 Kategorien) + PhotoPairCard + Tinder-Swipe Cleaner
- E-Mail-Tab mit Gmail OAuth, Filter, Checkboxen, Mailinglisten
- Kontakte-Tab: Duplikate (Union-Find), Unvollständig, Sicherungen, Alle
- Optimieren-Tab: Video-Komprimierung + Live→Standbild (je 2x gratis)
- Geheime Bibliothek (PIN + FaceID)
- Extras: Verlauf, Einstellungen
- Onboarding (3 Slides), Animated Splash
- Paywall (Lifetime 34,99€ + Weekly 4,99€) — MOCKED IAP
- Freemium: 100 MB Limit (lokale Persistenz)
- Reminder-Notifications (7 Trigger, 10 Sprachen)
- i18n: 10 Sprachen (DE primär)

## MOCKED
- StoreKit IAP → /api/users/subscribe flippt nur Flags
- Restore Purchases → /api/users/restore

## P0 — App Store Pflicht
1. **Echtes StoreKit IAP** — react-native-iap (Weekly 4,99€ Trial + Lifetime 34,99€)
2. Privacy Policy URL (Kenan hostet auf kenanplayer.com)
3. Terms of Service URL
4. Support-Email: support@kenanplayer.com

## P1 — Wichtige Features
5. E-Mail: Mail-Preview beim Antippen (2 Zeilen)
6. Kontakte Merge verfeinern (3+ Duplikate, Vorschau)
7. Google OAuth Token-Refresh stabiler
8. Video-Fortschrittsbalken (live während Komprimierung)
9. Geheime Bibliothek: iCloud-Warnung

## P2 — Nice to have
10. In-App Review (expo-store-review nach 1. Cleanup)
11. Push Notifications (Emergent-managed)
12. App Store Screenshots (1284×2778)

## Deployment
```bash
# Backend auf Hetzner
export SSHPASS='VEPEvj7Tkwnc'
sshpass -e scp -o StrictHostKeyChecking=no /app/backend/server.py root@46.62.205.112:/opt/cleanshot/server.py
sshpass -e ssh -o StrictHostKeyChecking=no root@46.62.205.112 'cd /opt/cleanshot && docker compose up -d --build cleanshot-api'

# Git Push
cd /app && git add -A && git commit -m "feat/fix: ..." && git push origin main
```
