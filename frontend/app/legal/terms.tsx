import React from "react";
import { useTranslation } from "react-i18next";
import LegalScreen from "@/src/components/LegalScreen";
import { TERMS } from "@/src/legal/content";

export default function TermsScreen() {
  const { i18n } = useTranslation();
  const lang = i18n.language?.slice(0, 2) ?? "en";
  const doc = TERMS[lang] ?? TERMS["en"];
  return <LegalScreen doc={doc} accentColor="#007AFF" />;
}
