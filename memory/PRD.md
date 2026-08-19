# CleanU — PRD / Projektstatus

**Stand: 19 Aug 2026 · Pod: spotless-31**

## Projekt-Übersicht
CleanU ist ein iOS-Foto/Speicher-Cleaner (Expo SDK 54, React Native, FastAPI, MongoDB).
Ziel: Cleanup-App (Bestseller im App Store) klonen und übertreffen.

## Zugänge
- GitHub: https://github.com/kenan1206/cleanshot (PAT: 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)
- Hetzner: root@46.62.205.112 PW: VEPEvj7Tkwnc
- Prod-Backend: https://cleanu.kenanplayer.com
- Emergent Preview: https://spotless-31.preview.emergentagent.com
- Bundle-ID: com.kenanplayer.cleanu

## Architektur
- Frontend: Expo SDK 54, expo-router, React Native
- Backend: FastAPI + Motor (MongoDB), port 8001
- DB: MongoDB local (test_database) / Hetzner (cleanu_production)
- Keine Auth: device_id basiert

## Implementiert (Live)
- Photo-Scan (9 Kategorien) + PhotoPairCard
- Start-Tab: Foto-Paare + Countdown-Banner
- E-Mail Tab: Gmail OAuth + Filter + Checkboxen + Mailinglisten
- Kontakte-Tab: Union-Find Duplikate + Incomplete + Backup + Alle
- Optimieren-Tab: Videos + Live-Photos
- Extras-Tab: Geheime Bibliothek (PIN+FaceID) + Verlauf + Settings
- Tinder-Swipe Cleaner, Category-Grid, Storage-Summary
- Animated Splash, Onboarding (3 Slides), Paywall UI
- i18n: 10 Sprachen (react-i18next)
- RevenueCat Integration (react-native-purchases)

## MOCKED
- StoreKit IAP: /api/users/subscribe flippt nur Flags (kein echtes StoreKit)
- Restore Purchases: Backend /api/users/restore

## Offene Tasks (Priorität)
### P0 — App Store Pflicht
1. Echtes StoreKit IAP (react-native-purchases / RevenueCat) — Weekly 4,99€ (7T Trial) + Lifetime 34,99€
2. Privacy Policy URL (Kenan muss hosten auf kenanplayer.com)
3. Terms of Service URL
4. Support E-Mail: support@kenanplayer.com

### P1 — Wichtige Features
5. E-Mail: Einzel-Mail Preview (2 Zeilen beim Antippen)
6. Kontakte Merge verfeinern (3+ Duplikate, Merge-Vorschau)
7. OAuth Token-Refresh stabiler
8. Video-Fortschrittsbalken während Komprimierung
9. Geheime Bibliothek: iCloud-Warnung

### P2 — Nice to have
10. In-App Review (expo-store-review) nach erstem Cleanup
11. Push Notifications (Emergent-managed)
12. App Store Screenshots (1284×2778)

## Nächste Session
- Kenan entscheidet Priorität (P0 IAP vs P1 Features)
- Git Push nach jeder Änderung
- Backend-Änderungen → Hetzner deployen
