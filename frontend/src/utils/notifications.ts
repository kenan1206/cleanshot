// Local (on-device) scheduled notifications for CleanU.
// No server / no google-services.json needed — everything is scheduled on the device.
// Texts are pulled from i18n so they follow the user's language.
//
// NOTE: scheduled local notifications only fire on a real build (not Expo Go web/preview).

import * as Notifications from "expo-notifications";
import i18n from "i18next";
import { formatSize } from "@/src/utils/photos";
import { storage } from "@/src/utils/storage";

const PERMISSION_ASKED_KEY = "cleanu.notif_permission_asked";

// Foreground presentation (banner + sound while app is open).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function hasNotificationPermission(): Promise<boolean> {
  const s = await Notifications.getPermissionsAsync();
  return s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/** Ask once, contextually. Returns true if granted. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain) {
    await storage.setItem(PERMISSION_ASKED_KEY, true);
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  }
  return false;
}

// Build a Date N days from now at a specific local hour (avoids quiet hours 22–8).
function inDaysAt(days: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

const T = (k: string, opts?: Record<string, unknown>) => i18n.t(`notifications.${k}`, opts) as string;

export type NotifContext = {
  reclaimableMB?: number; // space still findable from last scan
  weekFreedMB?: number; // freed this week / this session
  mbUsed?: number; // free-tier MB used
};

/**
 * Cancel & reschedule the full CleanU reminder set. Call after a successful cleanup
 * (permission granted) and on app foreground when permission is already granted.
 */
export async function scheduleCleanUNotifications(ctx: NotifContext = {}): Promise<void> {
  try {
    if (!(await hasNotificationPermission())) return;
    await Notifications.cancelAllScheduledNotificationsAsync();

    const reclaimable = ctx.reclaimableMB ?? 0;
    const week = ctx.weekFreedMB ?? 0;
    const mbUsed = ctx.mbUsed ?? 0;

    const jobs: { title: string; body: string; date: Date }[] = [];

    // 1) Cleanup reminder — 3 days, 19:00
    jobs.push({
      title: T("cleanup_title"),
      body: reclaimable > 0 ? T("cleanup_body", { size: formatSize(reclaimable) }) : T("cleanup_body_generic"),
      date: inDaysAt(3, 19),
    });

    // 2) Big find not cleaned — 1 day, 19:00 (only if a meaningful amount is left)
    if (reclaimable >= 200) {
      jobs.push({ title: T("bigfind_title"), body: T("bigfind_body", { size: formatSize(reclaimable) }), date: inDaysAt(1, 19) });
    }

    // 3) First-scan nudge — 2 days, 18:00
    jobs.push({ title: T("firstscan_title"), body: T("firstscan_body"), date: inDaysAt(2, 18) });

    // 4) Win-back — 7 days, 11:00
    jobs.push({ title: T("winback_title"), body: T("winback_body"), date: inDaysAt(7, 11) });

    // 6) Live photos tip — 4 days, 19:00
    jobs.push({ title: T("livephotos_title"), body: T("livephotos_body"), date: inDaysAt(4, 19) });

    // 7) Quota almost full — 1 day, 12:00 (only when close to the 100 MB free limit)
    if (mbUsed >= 80) {
      jobs.push({ title: T("quota_title"), body: T("quota_body"), date: inDaysAt(1, 12) });
    }

    for (const j of jobs) {
      await Notifications.scheduleNotificationAsync({
        content: { title: j.title, body: j.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: j.date },
      });
    }

    // 5) Weekly report — every Sunday 11:00 (repeats)
    if (week > 0) {
      await Notifications.scheduleNotificationAsync({
        content: { title: T("weekly_title"), body: T("weekly_body", { size: formatSize(week) }) },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: 1, // Sunday
          hour: 11,
          minute: 0,
        },
      });
    }
  } catch {
    // never crash the app because of notifications
  }
}
