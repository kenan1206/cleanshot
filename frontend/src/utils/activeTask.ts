/**
 * activeTask — hält den Bildschirm an während aktiver Operationen wach
 * und sendet eine Push-Benachrichtigung wenn die Aktion im Hintergrund fertig wird.
 *
 * Verwendung:
 *   await startActiveTask("Scan läuft");
 *   // ... Arbeit ...
 *   await finishActiveTask("Scan fertig", "1,2 GB gefunden");
 *   // oder bei Abbruch/Fehler:
 *   cancelActiveTask();
 */

import { AppState, AppStateStatus } from "react-native";
import * as KeepAwake from "expo-keep-awake";
import * as Notifications from "expo-notifications";
import i18n from "i18next";
import { hasNotificationPermission } from "./notifications";

const KEEP_AWAKE_TAG = "cleanu-active-task";

let _isActive = false;
let _bgLabel = "";
let _bgNotifId: string | null = null;
let _wentToBackground = false;

// Globaler AppState-Listener — wird einmal beim Modulstart registriert
AppState.addEventListener("change", async (state: AppStateStatus) => {
  if (!_isActive) return;

  if (state === "background" || state === "inactive") {
    _wentToBackground = true;
    if (_bgNotifId) return; // bereits gezeigt
    if (await hasNotificationPermission()) {
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: "CleanU",
            body: i18n.t("notifications.bg_processing", { label: _bgLabel }) as string,
          },
          trigger: null,
        });
        _bgNotifId = id as unknown as string;
      } catch { /**/ }
    }
  } else if (state === "active" && _bgNotifId) {
    try { await Notifications.dismissNotificationAsync(_bgNotifId); } catch { /**/ }
    _bgNotifId = null;
  }
});

/** Startet eine aktive Aufgabe: Bildschirm bleibt an. */
export async function startActiveTask(backgroundLabel: string): Promise<void> {
  _isActive = true;
  _bgLabel = backgroundLabel;
  _bgNotifId = null;
  _wentToBackground = false;
  try { await KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG); } catch { /**/ }
}

/**
 * Beendet die aktive Aufgabe. Bildschirm-Sperre wieder aktiv.
 * Sendet eine Completion-Notification wenn der Nutzer die App verlassen hatte.
 */
export async function finishActiveTask(title: string, body: string): Promise<void> {
  _isActive = false;
  try { await KeepAwake.deactivateKeepAwakeAsync(KEEP_AWAKE_TAG); } catch { /**/ }

  // "Im Hintergrund"-Notification entfernen
  if (_bgNotifId) {
    try { await Notifications.dismissNotificationAsync(_bgNotifId); } catch { /**/ }
    _bgNotifId = null;
  }

  // Fertig-Notification nur wenn Nutzer die App verlassen hatte
  const appIsBackground = AppState.currentState === "background" || AppState.currentState === "inactive";
  if ((_wentToBackground || appIsBackground) && await hasNotificationPermission()) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: null,
      });
    } catch { /**/ }
  }

  _wentToBackground = false;
}

/** Bricht die aktive Aufgabe ab, ohne Notification zu senden. */
export function cancelActiveTask(): void {
  _isActive = false;
  _wentToBackground = false;
  KeepAwake.deactivateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
  if (_bgNotifId) {
    Notifications.dismissNotificationAsync(_bgNotifId).catch(() => {});
    _bgNotifId = null;
  }
}
