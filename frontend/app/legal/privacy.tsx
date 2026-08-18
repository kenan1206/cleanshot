import React from "react";
import { useTranslation } from "react-i18next";
import LegalScreen from "@/src/components/LegalScreen";
import { PRIVACY } from "@/src/legal/content";

export default function PrivacyScreen() {
  const { i18n } = useTranslation();
  const lang = i18n.language?.slice(0, 2) ?? "en";
  const doc = PRIVACY[lang] ?? PRIVACY["en"];
  return <LegalScreen doc={doc} accentColor="#34C759" />;
}
