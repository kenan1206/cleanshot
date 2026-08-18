// Kontakt Detail Screens — Duplikate, Unvollständig, Sicherungen, Alle Kontakte
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput,
  ActivityIndicator, SectionList, TouchableOpacity, ScrollView, Share, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Contacts from "expo-contacts";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import i18n from "@/src/i18n";
import { storage } from "@/src/utils/storage";
import { useApp } from "@/src/context/AppContext";

type ViewType = "duplicates" | "incomplete" | "backups" | "all";

interface ContactGroup {
  key: string;
  name: string;
  contacts: Contacts.Contact[];
}

// ── Helpers ────────────────────────────────────────────────
// ── vCard Export ──────────────────────────────────────────
const BACKUP_DATE_KEY = "cleanu.contacts_backup_date";

function escapeVCard(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function contactToVCard(c: Contacts.Contact): string {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];
  const fn = escapeVCard(c.name ?? "");
  if (fn) lines.push(`FN:${fn}`);
  const last = escapeVCard(c.lastName ?? "");
  const first = escapeVCard(c.firstName ?? "");
  if (last || first) lines.push(`N:${last};${first};;;`);
  c.phoneNumbers?.forEach(p => {
    if (p.number) lines.push(`TEL;TYPE=CELL:${p.number}`);
  });
  c.emails?.forEach(e => {
    if (e.email) lines.push(`EMAIL:${e.email}`);
  });
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

async function exportVCard(contacts: Contacts.Contact[]): Promise<void> {
  const vcard = contacts.map(contactToVCard).join("\r\n");
  const date = new Date().toLocaleDateString("de-DE");
  const filename = `Kontakte_${date.replace(/\./g, "-")}.vcf`;
  const uri = FileSystem.documentDirectory + filename;
  await FileSystem.writeAsStringAsync(uri, vcard, { encoding: FileSystem.EncodingType.UTF8 });
  await storage.setItem(BACKUP_DATE_KEY, new Date().toISOString());
  if (Platform.OS === "ios") {
    await Share.share({ url: uri, title: filename });
  } else {
    await Share.share({ message: vcard, title: filename });
  }
}

// ── Phone normalization ────────────────────────────────────
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return "";
  if (digits.startsWith("0049")) return digits.slice(4);
  if (digits.startsWith("49") && digits.length >= 11) return digits.slice(2);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

function normName(c: Contacts.Contact): string {
  return (c.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] ?? "?").toUpperCase();
}

function avatarColor(name: string): string {
  const colors = ["#007AFF","#FF9500","#34C759","#AF52DE","#FF3B30","#5856D6","#FF2D55","#5AC8FA"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xFFFFFF;
  return colors[h % colors.length];
}

function fmtPhone(p: Contacts.PhoneNumber): string {
  return p.number ?? p.digits ?? "";
}

function fmtEmail(e: Contacts.Email): string {
  return e.email ?? "";
}

// Union-Find: grupiert Kontakte mit gleichem Namen ODER gleicher Nummer ODER gleicher Email
function findDuplicateGroups(contacts: Contacts.Contact[]): ContactGroup[] {
  const n = contacts.length;
  const parent: number[] = Array.from({ length: n }, (_, i) => i);

  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function union(x: number, y: number): void {
    const px = find(x), py = find(y);
    if (px !== py) parent[px] = py;
  }

  const nameIdx: Record<string, number> = {};
  const phoneIdx: Record<string, number> = {};
  const emailIdx: Record<string, number> = {};

  contacts.forEach((c, i) => {
    // Gleicher Name
    const nm = normName(c);
    if (nm) {
      if (nameIdx[nm] !== undefined) union(i, nameIdx[nm]);
      else nameIdx[nm] = i;
    }
    // Gleiche Handynummer
    (c.phoneNumbers ?? []).forEach(p => {
      const num = normalizePhone(p.number ?? p.digits ?? "");
      if (num.length >= 6) {
        if (phoneIdx[num] !== undefined) union(i, phoneIdx[num]);
        else phoneIdx[num] = i;
      }
    });
    // Gleiche E-Mail
    (c.emails ?? []).forEach(e => {
      const em = (e.email ?? "").toLowerCase().trim();
      if (em) {
        if (emailIdx[em] !== undefined) union(i, emailIdx[em]);
        else emailIdx[em] = i;
      }
    });
  });

  // Gruppen zusammenstellen
  const groups: Record<number, { contacts: Contacts.Contact[]; reasons: string[] }> = {};
  contacts.forEach((c, i) => {
    const root = find(i);
    if (!groups[root]) groups[root] = { contacts: [], reasons: [] };
    groups[root].contacts.push(c);
  });

  return Object.entries(groups)
    .filter(([, g]) => g.contacts.length > 1)
    .map(([key, g]) => ({
      key,
      name: g.contacts.find(c => c.name)?.name ?? i18n.t("contact_detail_screen.no_name"),
      contacts: g.contacts,
    }))
    .sort((a, b) => b.contacts.length - a.contacts.length);
}

function findIncomplete(contacts: Contacts.Contact[]): Contacts.Contact[] {
  return contacts.filter(c => {
    const hasPhone = (c.phoneNumbers?.length ?? 0) > 0;
    const hasEmail = (c.emails?.length ?? 0) > 0;
    const hasName = !!(c.name ?? "").trim();
    // Kein Name ODER (kein Telefon UND keine E-Mail)
    return !hasName || (!hasPhone && !hasEmail);
  }).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

// ── Main Component ─────────────────────────────────────────
export default function ContactDetail() {
  const { type } = useLocalSearchParams<{ type: ViewType }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { user, trackFeatureUse } = useApp();

  const FREE_CONTACT_USES = 2;
  const isPremium = !!user?.is_premium;
  const ctUsed = user?.free_contacts_used ?? 0;
  const ctRemaining = Math.max(0, FREE_CONTACT_USES - ctUsed);
  const contactsLocked = !isPremium && ctUsed >= FREE_CONTACT_USES;

  const [allContacts, setAllContacts] = useState<Contacts.Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [merging, setMerging] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [merged, setMerged] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        // Permission MUSS im Detail-Screen nochmals geprüft werden
        const perm = await Contacts.requestPermissionsAsync();
        if (!perm.granted) {
          setLoading(false);
          return;
        }
        // Nur sichere Fields — Birthday/Note können auf manchen iOS-Versionen crashen
        const { data } = await Contacts.getContactsAsync({
          fields: [
            Contacts.Fields.Name,
            Contacts.Fields.FirstName,
            Contacts.Fields.LastName,
            Contacts.Fields.PhoneNumbers,
            Contacts.Fields.Emails,
          ],
        });
        setAllContacts(data);
      } catch (e) {
        console.error("contacts load failed in detail:", e);
        // Retry ohne optionale Felder
        try {
          const { data } = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
          });
          setAllContacts(data);
        } catch {}
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const duplicateGroups = useMemo(
    () => findDuplicateGroups(allContacts).filter(g => !merged.has(g.key) && !skipped.has(g.key)),
    [allContacts, merged, skipped]
  );

  const incompleteContacts = useMemo(
    () => findIncomplete(allContacts),
    [allContacts]
  );

  const filteredAll = useMemo(() => {
    const q = search.toLowerCase();
    return allContacts
      .filter(c => !q || (c.name ?? "").toLowerCase().includes(q))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [allContacts, search]);

  const sectionedAll = useMemo(() => {
    const map: Record<string, Contacts.Contact[]> = {};
    filteredAll.forEach(c => {
      const letter = (c.name ?? "#")[0]?.toUpperCase() ?? "#";
      if (!map[letter]) map[letter] = [];
      map[letter].push(c);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({ title, data }));
  }, [filteredAll]);

  const doMerge = useCallback(async (group: ContactGroup) => {
    // Paywall gate: 2 free merges
    if (contactsLocked) {
      router.push({ pathname: "/paywall", params: { reason: "feature", feature: "contacts" } });
      return;
    }
    setMerging(group.key);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const [primary, ...rest] = group.contacts;
      // Merge all phones and emails into primary
      const allPhones: Contacts.PhoneNumber[] = [
        ...(primary.phoneNumbers ?? []),
        ...rest.flatMap(c => c.phoneNumbers ?? []),
      ];
      const allEmails: Contacts.Email[] = [
        ...(primary.emails ?? []),
        ...rest.flatMap(c => c.emails ?? []),
      ];
      // Deduplicate by value
      const seenPhones = new Set<string>();
      const uniquePhones = allPhones.filter(p => {
        const v = p.number ?? p.digits ?? "";
        if (!v || seenPhones.has(v)) return false;
        seenPhones.add(v); return true;
      });
      const seenEmails = new Set<string>();
      const uniqueEmails = allEmails.filter(e => {
        const v = e.email ?? "";
        if (!v || seenEmails.has(v)) return false;
        seenEmails.add(v); return true;
      });
      // Update primary
      await Contacts.updateContactAsync({ ...primary, phoneNumbers: uniquePhones, emails: uniqueEmails });
      // Delete duplicates
      for (const dup of rest) {
        if (dup.id) await Contacts.removeContactAsync(dup.id).catch(() => {});
      }
      setMerged(prev => new Set([...prev, group.key]));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Track usage — 1 merge = 1 use
      trackFeatureUse("contacts", 1).catch(() => {});
    } catch (e) {
      console.warn("merge failed", e);
    } finally {
      setMerging(null);
    }
  }, [contactsLocked, router, trackFeatureUse]);

  const doEdit = useCallback(async (contact: Contacts.Contact) => {
    if (!contact.id) return;
    // Paywall gate: locked after 2 merges
    if (contactsLocked) {
      router.push({ pathname: "/paywall", params: { reason: "feature", feature: "contacts" } });
      return;
    }
    try {
      await Contacts.presentFormAsync(contact.id, {});
      // Reload
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails] });
      setAllContacts(data);
    } catch (e) {
      console.warn("edit failed", e);
    }
  }, [contactsLocked, router]);

  const getTitle = (): string => {
    if (loading) return type === "duplicates" ? t("contact_screen.btn_duplicates") : type === "incomplete" ? t("contact_screen.btn_incomplete") : type === "backups" ? t("contact_detail_screen.header_backups") : t("contact_screen.btn_all");
    switch (type) {
      case "duplicates": return t("contact_detail_screen.header_duplicates", { count: duplicateGroups.length + merged.size });
      case "incomplete": return t("contact_detail_screen.header_incomplete", { count: incompleteContacts.length });
      case "backups": return t("contact_detail_screen.header_backups");
      default: return t("contact_detail_screen.header_all", { count: allContacts.length });
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="back-btn" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{getTitle()}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={s.loadingText}>{t("contact_detail_screen.loading_contacts")}</Text>
        </View>
      ) : (
        <>
          {type === "duplicates" && <DuplicatesScreen groups={duplicateGroups} merging={merging} onMerge={doMerge} onSkip={k => setSkipped(p => new Set([...p, k]))} insets={insets} ctRemaining={ctRemaining} contactsLocked={contactsLocked} />}
          {type === "incomplete" && <IncompleteScreen contacts={incompleteContacts} onEdit={doEdit} insets={insets} contactsLocked={contactsLocked} />}
          {type === "backups" && <BackupsScreen total={allContacts.length} contacts={allContacts} insets={insets} isPremium={isPremium} onPaywall={() => router.push({ pathname: "/paywall", params: { reason: "feature", feature: "contacts" } })} />}
          {(type === "all" || !type) && <AllContactsScreen sections={sectionedAll} total={allContacts.length} search={search} onSearch={setSearch} onEdit={doEdit} insets={insets} contactsLocked={contactsLocked} />}
        </>
      )}
    </View>
  );
}

// ── Duplikate Screen ────────────────────────────────────────
function DuplicatesScreen({ groups, merging, onMerge, onSkip, insets, ctRemaining, contactsLocked }: {
  groups: ContactGroup[];
  merging: string | null;
  onMerge: (g: ContactGroup) => void;
  onSkip: (k: string) => void;
  insets: any;
  ctRemaining: number;
  contactsLocked: boolean;
}) {
  const { t } = useTranslation();
  if (groups.length === 0) return (
    <View style={s.center}>
      <Ionicons name="checkmark-circle" size={64} color="#34C759" />
      <Text style={s.emptyTitle}>{t("contact_detail_screen.no_duplicates_title")}</Text>
      <Text style={s.emptySub}>{t("contact_detail_screen.no_duplicates_sub")}</Text>
    </View>
  );

  return (
    <FlatList
      data={groups}
      keyExtractor={g => g.key}
      ListHeaderComponent={
        !contactsLocked ? (
          <View style={s.freeUsesBanner} testID="contacts-free-uses-banner">
            <Ionicons name="flash" size={14} color="#007AFF" />
            <Text style={s.freeUsesText}>
              {ctRemaining === 0 ? "Keine freien Zusammenführungen mehr" : `${ctRemaining} freie Zusammenführung${ctRemaining !== 1 ? "en" : ""} übrig`}
            </Text>
          </View>
        ) : (
          <View style={[s.freeUsesBanner, { backgroundColor: "#FFF4E5", borderColor: "#FF950030" }]} testID="contacts-locked-banner">
            <Ionicons name="lock-closed" size={14} color="#FF9500" />
            <Text style={[s.freeUsesText, { color: "#FF9500" }]}>Gratis-Limit erreicht — Pro für unbegrenzt</Text>
          </View>
        )
      }
      contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 24 }]}
      renderItem={({ item: group }) => (
        <View style={s.groupCard} testID={`dup-group-${group.key}`}>
          <Text style={s.groupTitle}>{t("contact_detail_screen.group_title", { count: group.contacts.length })}</Text>
          {group.contacts.map((c, i) => (
            <View key={c.id ?? i} style={[s.contactRow, i > 0 && s.contactRowBorder]}>
              <View style={[s.avatar, { backgroundColor: avatarColor(c.name ?? "?") }]}>
                <Text style={s.avatarText}>{initials(c.name ?? "?")}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.contactName}>{c.name ?? t("contact_detail_screen.no_name")}</Text>
                {c.phoneNumbers?.[0] && <Text style={s.contactSub}>{fmtPhone(c.phoneNumbers[0])}</Text>}
                {c.emails?.[0] && <Text style={s.contactSub}>{fmtEmail(c.emails[0])}</Text>}
              </View>
            </View>
          ))}
          <View style={s.groupActions}>
            <TouchableOpacity
              testID={`skip-${group.key}`}
              style={s.skipBtn}
              onPress={() => onSkip(group.key)}
            >
              <Text style={s.skipBtnText}>{t("contact_detail_screen.skip_btn")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={`merge-${group.key}`}
              style={[s.mergeBtn, merging === group.key && { opacity: 0.7 }, contactsLocked && { backgroundColor: "#FF9500" }]}
              onPress={() => onMerge(group)}
              disabled={merging !== null}
            >
              {merging === group.key ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : contactsLocked ? (
                <>
                  <Ionicons name="lock-closed" size={16} color="#fff" />
                  <Text style={s.mergeBtnText}>Pro</Text>
                </>
              ) : (
                <>
                  <Ionicons name="git-merge-outline" size={16} color="#fff" />
                  <Text style={s.mergeBtnText}>{t("contact_detail_screen.merge_btn")}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    />
  );
}

// ── Unvollständige Screen ──────────────────────────────────
function IncompleteScreen({ contacts, onEdit, insets, contactsLocked }: {
  contacts: Contacts.Contact[];
  onEdit: (c: Contacts.Contact) => void;
  insets: any;
  contactsLocked: boolean;
}) {
  const { t } = useTranslation();
  if (contacts.length === 0) return (
    <View style={s.center}>
      <Ionicons name="checkmark-circle" size={64} color="#34C759" />
      <Text style={s.emptyTitle}>{t("contact_detail_screen.all_complete_title")}</Text>
      <Text style={s.emptySub}>{t("contact_detail_screen.all_complete_sub")}</Text>
    </View>
  );

  return (
    <FlatList
      data={contacts}
      keyExtractor={c => c.id ?? c.name ?? Math.random().toString()}
      contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 24 }]}
      ListHeaderComponent={
        <Text style={s.sectionInfo}>
          {t("contact_detail_screen.missing_info", { count: contacts.length })}
        </Text>
      }
      renderItem={({ item: c }) => {
        const hasPhone = (c.phoneNumbers?.length ?? 0) > 0;
        const hasEmail = (c.emails?.length ?? 0) > 0;
        const hasName = !!(c.name ?? "").trim();
        const missing: string[] = [];
        if (!hasName) missing.push(t("contact_detail_screen.missing_name"));
        if (!hasPhone) missing.push(t("contact_detail_screen.missing_phone"));
        if (!hasEmail) missing.push(t("contact_detail_screen.missing_email"));
        return (
          <View style={s.incompleteRow} testID={`incomplete-${c.id}`}>
            <View style={[s.avatar, { backgroundColor: avatarColor(c.name ?? "?") }]}>
              <Text style={s.avatarText}>{initials(c.name ?? "?")}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.contactName}>{c.name ?? t("contact_detail_screen.no_name")}</Text>
              <Text style={s.missingBadge}>{t("contact_detail_screen.missing_label", { fields: missing.join(", ") })}</Text>
            </View>
            <TouchableOpacity
              testID={`edit-${c.id}`}
              style={[s.editBtn, contactsLocked && { backgroundColor: "#FF9500" }]}
              onPress={() => onEdit(c)}
            >
              {contactsLocked
                ? <Ionicons name="lock-closed" size={14} color="#fff" />
                : <Text style={s.editBtnText}>{t("contact_detail_screen.edit_btn")}</Text>
              }
            </TouchableOpacity>
          </View>
        );
      }}
    />
  );
}

// ── Sicherungen Screen ─────────────────────────────────────
function BackupsScreen({ total, contacts, insets, isPremium, onPaywall }: { total: number; contacts: Contacts.Contact[]; insets: any; isPremium: boolean; onPaywall: () => void }) {
  const [exporting, setExporting] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [exported, setExported] = useState(false);

  useEffect(() => {
    storage.getItem(BACKUP_DATE_KEY, null as string | null).then(d => {
      if (d) {
        const date = new Date(d);
        setLastBackup(date.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }));
      }
    });
  }, []);

  const doExport = useCallback(async () => {
    if (exporting || contacts.length === 0) return;
    setExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await exportVCard(contacts);
      const now = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      setLastBackup(now);
      setExported(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setExporting(false);
    }
  }, [contacts, exporting]);

  return (
    <ScrollView contentContainerStyle={[s.backupContent, { paddingBottom: insets.bottom + 24 }]}>
      {/* Icon */}
      <View style={s.backupIcon}>
        <Ionicons name="cloud-outline" size={56} color="#007AFF" />
      </View>
      <Text style={s.backupTitle}>Kontakte sichern</Text>
      <Text style={s.backupSub}>
        Exportiere alle {total.toLocaleString("de-DE")} Kontakte als vCard-Datei (.vcf) — kompatibel mit iPhone, Mac, Google Contacts und Outlook.
      </Text>

      {/* Info-Karte */}
      <View style={s.backupInfoCard}>
        <View style={s.backupInfoRow}>
          <Ionicons name="people-outline" size={20} color="#007AFF" />
          <View style={{ flex: 1 }}>
            <Text style={s.backupInfoLabel}>Kontakte gesamt</Text>
            <Text style={s.backupInfoValue}>{total.toLocaleString("de-DE")} Kontakte</Text>
          </View>
        </View>
        <View style={[s.backupInfoRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.06)", paddingTop: 14 }]}>
          <Ionicons name="time-outline" size={20} color={lastBackup ? "#34C759" : "#8E8E93"} />
          <View style={{ flex: 1 }}>
            <Text style={s.backupInfoLabel}>Letzte Sicherung</Text>
            <Text style={[s.backupInfoValue, { color: lastBackup ? "#34C759" : "#8E8E93" }]}>
              {lastBackup ?? "Noch nie gesichert"}
            </Text>
          </View>
        </View>
      </View>

      {/* Export Button */}
      <TouchableOpacity
        testID="backup-export-btn"
        style={[s.exportBtn, exporting && { opacity: 0.7 }, !isPremium && { backgroundColor: "#FF9500" }]}
        onPress={isPremium ? doExport : onPaywall}
        activeOpacity={0.85}
        disabled={exporting}
      >
        {!isPremium ? (
          <>
            <Ionicons name="lock-closed" size={20} color="#fff" />
            <Text style={s.exportBtnText}>Pro — Als vCard exportieren</Text>
          </>
        ) : exporting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name={exported ? "checkmark-circle" : "download-outline"} size={20} color="#fff" />
        )}
        {isPremium && (
          <Text style={s.exportBtnText}>
            {exporting ? "Wird exportiert…" : exported ? "Gesichert ✓" : "Als vCard exportieren (.vcf)"}
          </Text>
        )}
      </TouchableOpacity>

      {/* Hinweis */}
      <View style={s.backupHint}>
        <Ionicons name="information-circle-outline" size={16} color="#8E8E93" />
        <Text style={s.backupHintText}>
          Die .vcf-Datei kannst du per AirDrop, iCloud Drive oder E-Mail sichern. Zum Importieren einfach die Datei öffnen.
        </Text>
      </View>
    </ScrollView>
  );
}

// ── Alle Kontakte Screen ───────────────────────────────────
function AllContactsScreen({ sections, total, search, onSearch, onEdit, insets, contactsLocked }: {
  sections: { title: string; data: Contacts.Contact[] }[];
  total: number;
  search: string;
  onSearch: (t: string) => void;
  onEdit: (c: Contacts.Contact) => void;
  insets: any;
  contactsLocked: boolean;
}) {
  const { t, i18n: i18nInstance } = useTranslation();
  return (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={s.searchWrap}>
        <Ionicons name="search" size={16} color="#8E8E93" style={{ marginLeft: 10 }} />
        <TextInput
          testID="contacts-search"
          style={s.searchInput}
          value={search}
          onChangeText={onSearch}
          placeholder={t("contact_detail_screen.search_placeholder")}
          placeholderTextColor="#C7C7CC"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(c, i) => c.id ?? `${i}`}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        stickySectionHeadersEnabled
        ListHeaderComponent={
          <Text style={s.sectionInfo}>{t("contact_detail_screen.all_count", { count: total.toLocaleString(i18nInstance.language) })}</Text>
        }
        renderSectionHeader={({ section }) => (
          <View style={s.sectionHeader}>
            <Text style={s.sectionHeaderText}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item: c }) => (
          <TouchableOpacity
            testID={`all-contact-${c.id}`}
            style={s.allContactRow}
            onPress={() => onEdit(c)}
            activeOpacity={0.7}
          >
            <View style={[s.avatar, { backgroundColor: avatarColor(c.name ?? "?") }]}>
              <Text style={s.avatarText}>{initials(c.name ?? "?")}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.contactName}>{c.name ?? t("contact_detail_screen.no_name")}</Text>
              {c.phoneNumbers?.[0] && (
                <Text style={s.contactSub}>{fmtPhone(c.phoneNumbers[0])}</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.08)" },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  loadingText: { fontSize: 15, color: "#8E8E93", marginTop: 8 },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: "#000" },
  emptySub: { fontSize: 14, color: "#8E8E93", textAlign: "center" },
  listContent: { padding: 16, gap: 12 },
  freeUsesBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EAF2FF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, borderWidth: 1, borderColor: "#007AFF30" },
  freeUsesText: { fontSize: 13, fontWeight: "600", color: "#007AFF", flex: 1 },
  sectionInfo: { fontSize: 13, color: "#8E8E93", fontWeight: "500", marginHorizontal: 16, marginBottom: 8, marginTop: 8 },

  // Duplicate groups
  groupCard: { backgroundColor: "#F9F9F9", borderRadius: 18, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
  groupTitle: { fontSize: 12, fontWeight: "700", color: "#8E8E93", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff" },
  contactRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.06)" },
  groupActions: { flexDirection: "row", gap: 10, padding: 12 },
  skipBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: "#F2F2F7", alignItems: "center", justifyContent: "center" },
  skipBtnText: { fontSize: 15, fontWeight: "600", color: "#3C3C43" },
  mergeBtn: { flex: 2, height: 44, borderRadius: 12, backgroundColor: "#007AFF", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  mergeBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // Incomplete
  incompleteRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.06)" },
  missingBadge: { fontSize: 12, color: "#FF9500", fontWeight: "600", marginTop: 2 },
  editBtn: { backgroundColor: "#007AFF18", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  editBtnText: { fontSize: 13, fontWeight: "700", color: "#007AFF" },

  // All contacts
  searchWrap: { flexDirection: "row", alignItems: "center", backgroundColor: "#F2F2F7", marginHorizontal: 16, marginVertical: 8, borderRadius: 12, height: 38 },
  searchInput: { flex: 1, fontSize: 15, color: "#000", paddingHorizontal: 8, paddingVertical: 0 },
  sectionHeader: { backgroundColor: "#F2F2F7", paddingHorizontal: 16, paddingVertical: 4 },
  sectionHeaderText: { fontSize: 13, fontWeight: "700", color: "#8E8E93" },
  allContactRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.06)", backgroundColor: "#fff" },

  // Shared
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarText: { fontSize: 16, fontWeight: "800", color: "#fff" },
  contactName: { fontSize: 16, fontWeight: "600", color: "#000" },
  contactSub: { fontSize: 13, color: "#8E8E93", marginTop: 2 },

  // Backups
  backupContent: { padding: 24, alignItems: "center" },
  backupIcon: { width: 96, height: 96, borderRadius: 28, backgroundColor: "#EEF6FF", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  backupTitle: { fontSize: 24, fontWeight: "800", color: "#000", marginBottom: 8, textAlign: "center" },
  backupSub: { fontSize: 15, color: "#8E8E93", textAlign: "center", lineHeight: 22, marginBottom: 24 },
  backupInfoCard: { width: "100%", backgroundColor: "#F9F9F9", borderRadius: 18, padding: 16, gap: 0, marginBottom: 20 },
  backupInfoRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  backupInfoLabel: { fontSize: 12, color: "#8E8E93", fontWeight: "500" },
  backupInfoValue: { fontSize: 16, fontWeight: "700", color: "#000", marginTop: 2 },
  exportBtn: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 58, borderRadius: 18, backgroundColor: "#007AFF", marginBottom: 16, shadowColor: "#007AFF", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
  exportBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  backupHint: { flexDirection: "row", gap: 8, backgroundColor: "#F2F2F7", borderRadius: 12, padding: 14, width: "100%" },
  backupHintText: { flex: 1, fontSize: 13, color: "#8E8E93", lineHeight: 19 },
});
