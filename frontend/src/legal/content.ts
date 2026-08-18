// Legal content for CleanU — Terms of Service + Privacy Policy
// All 10 languages: de, en, tr, es, fr, it, nl, pl, pt, ru

export type LegalSection = { title: string; body: string };
export type LegalDoc = { heading: string; updated: string; sections: LegalSection[] };

// ─────────────────────────────────────────────────────────────────────────────
// TERMS OF SERVICE
// ─────────────────────────────────────────────────────────────────────────────
export const TERMS: Record<string, LegalDoc> = {
  de: {
    heading: "Nutzungsbedingungen",
    updated: "Stand: August 2026",
    sections: [
      {
        title: "1. Über CleanU",
        body: "CleanU ist eine iOS-App zur Bereinigung deiner Fotomediathek, Videos und Kontakte, entwickelt von Kenan Artiran. Die App läuft vollständig auf deinem Gerät – keine Daten werden auf unsere Server hochgeladen.",
      },
      {
        title: "2. Kostenlose Version",
        body: "Die kostenlose Version erlaubt dir, bis zu 50 Fotos oder 100 MB Speicher freizugeben. Nach Erreichen dieses Limits ist ein Upgrade auf CleanU Premium erforderlich, um weitere Bereinigungen durchzuführen. Kontakte und Geheime Bibliothek sind im kostenlosen Plan unbegrenzt nutzbar.",
      },
      {
        title: "3. CleanU Premium",
        body: "Premium ist als wöchentliches Abonnement (4,99 €/Woche, 7 Tage kostenlose Testphase) oder als einmalige Lifetime-Zahlung (34,99 €) erhältlich. Die Testphase beginnt sofort und verlängert sich automatisch in ein bezahltes Abonnement, sofern es nicht mindestens 24 Stunden vor Ende der Testphase gekündigt wird. Zahlungen werden über Apple verarbeitet und erscheinen in deinen iTunes-Kontoauszügen. Abonnements können jederzeit über die iOS-Einstellungen → Apple ID → Abonnements gekündigt werden.",
      },
      {
        title: "4. Käufe wiederherstellen",
        body: "Wenn du Premium bereits erworben hast, kannst du es auf demselben Gerät oder mit derselben Apple ID über die Funktion 'Käufe wiederherstellen' in den App-Einstellungen kostenlos wiederherstellen.",
      },
      {
        title: "5. Nutzung",
        body: "Du stimmst zu, die App nur für rechtmäßige Zwecke zu nutzen. Du darfst die App nicht reverse-engineeren, modifizieren oder für kommerzielle Zwecke weiterverteilen. Wir behalten uns das Recht vor, den Dienst jederzeit zu ändern oder einzustellen.",
      },
      {
        title: "6. Haftungsausschluss",
        body: "CleanU übernimmt keine Haftung für versehentlich gelöschte Fotos oder Daten. Stelle sicher, dass du ein Backup wichtiger Inhalte hast, bevor du Bereinigungen durchführst. Die App wird 'wie besehen' bereitgestellt ohne jegliche Garantien.",
      },
      {
        title: "7. Änderungen",
        body: "Wir können diese Nutzungsbedingungen jederzeit aktualisieren. Wesentliche Änderungen werden in der App kommuniziert. Die fortgesetzte Nutzung der App gilt als Zustimmung zu den aktualisierten Bedingungen.",
      },
      {
        title: "8. Kontakt",
        body: "Bei Fragen oder Problemen erreichst du uns unter: kenanveo1907@gmail.com",
      },
    ],
  },

  en: {
    heading: "Terms of Service",
    updated: "Last updated: August 2026",
    sections: [
      {
        title: "1. About CleanU",
        body: "CleanU is an iOS app for cleaning your photo library, videos, and contacts, developed by Kenan Artiran. The app runs entirely on your device — no data is uploaded to our servers.",
      },
      {
        title: "2. Free Version",
        body: "The free version allows you to free up to 50 photos or 100 MB of storage. After reaching this limit, an upgrade to CleanU Premium is required to perform further cleanups. Contacts and Secret Library features are unlimited in the free plan.",
      },
      {
        title: "3. CleanU Premium",
        body: "Premium is available as a weekly subscription (€4.99/week, 7-day free trial) or a one-time Lifetime payment (€34.99). The trial begins immediately and automatically renews into a paid subscription unless cancelled at least 24 hours before the trial ends. Payments are processed by Apple and will appear on your iTunes account statements. Subscriptions can be cancelled at any time via iOS Settings → Apple ID → Subscriptions.",
      },
      {
        title: "4. Restoring Purchases",
        body: "If you have previously purchased Premium, you can restore it on the same device or with the same Apple ID using the 'Restore Purchases' feature in the app settings at no charge.",
      },
      {
        title: "5. Acceptable Use",
        body: "You agree to use the app only for lawful purposes. You may not reverse-engineer, modify, or redistribute the app for commercial purposes. We reserve the right to modify or discontinue the service at any time.",
      },
      {
        title: "6. Disclaimer",
        body: "CleanU is not liable for accidentally deleted photos or data. Please ensure you have a backup of important content before performing any cleanups. The app is provided 'as is' without any warranties.",
      },
      {
        title: "7. Changes",
        body: "We may update these Terms of Service at any time. Material changes will be communicated within the app. Continued use of the app constitutes acceptance of the updated terms.",
      },
      {
        title: "8. Contact",
        body: "For questions or issues, contact us at: kenanveo1907@gmail.com",
      },
    ],
  },

  tr: {
    heading: "Kullanım Koşulları",
    updated: "Son güncelleme: Ağustos 2026",
    sections: [
      {
        title: "1. CleanU Hakkında",
        body: "CleanU, Kenan Artiran tarafından geliştirilen fotoğraf, kişi ve e-posta temizleme uygulamasıdır. Uygulama tamamen cihazınızda çalışır — hiçbir veri sunucularımıza yüklenmez.",
      },
      {
        title: "2. Ücretsiz Sürüm",
        body: "Ücretsiz sürüm, 50 adede kadar fotoğraf silmenize veya 100 MB depolama alanı boşaltmanıza izin verir. Bu sınıra ulaşıldıktan sonra temizlemeye devam etmek için CleanU Premium'a yükseltme gereklidir. E-posta Temizleyici, Kişiler ve Gizli Kütüphane özellikleri ücretsiz planda sınırsız kullanılabilir.",
      },
      {
        title: "3. CleanU Premium",
        body: "Premium, haftalık abonelik (4,99 €/hafta, 7 gün ücretsiz deneme) veya tek seferlik Lifetime ödemesi (34,99 €) olarak mevcuttur. Deneme süresi hemen başlar ve deneme süresi bitmeden en az 24 saat önce iptal edilmediği sürece otomatik olarak ücretli aboneliğe dönüşür. Ödemeler Apple tarafından işlenir. Abonelikler iOS Ayarlar → Apple Kimliği → Abonelikler üzerinden iptal edilebilir.",
      },
      {
        title: "4. Satın Almaları Geri Yükleme",
        body: "Premium'u daha önce satın aldıysanız, uygulama ayarlarındaki 'Satın Almaları Geri Yükle' özelliğini kullanarak aynı cihazda veya aynı Apple Kimliği ile ücretsiz olarak geri yükleyebilirsiniz.",
      },
      {
        title: "5. Kabul Edilebilir Kullanım",
        body: "Uygulamayı yalnızca yasal amaçlar için kullanmayı kabul edersiniz. Uygulamayı ticari amaçlarla tersine mühendislik yapamazsınız, değiştiremezsiniz veya dağıtamazsınız.",
      },
      {
        title: "6. Sorumluluk Reddi",
        body: "CleanU, yanlışlıkla silinen fotoğraf veya verilerden sorumlu değildir. Temizlik yapmadan önce önemli içeriklerin yedeğini aldığınızdan emin olun. Uygulama herhangi bir garanti verilmeksizin 'olduğu gibi' sunulmaktadır.",
      },
      {
        title: "7. Değişiklikler",
        body: "Bu Kullanım Koşullarını istediğimiz zaman güncelleyebiliriz. Önemli değişiklikler uygulama içinde bildirilecektir.",
      },
      {
        title: "8. İletişim",
        body: "Sorularınız için: kenanveo1907@gmail.com",
      },
    ],
  },

  es: {
    heading: "Términos de Servicio",
    updated: "Última actualización: agosto 2026",
    sections: [
      { title: "1. Sobre CleanU", body: "CleanU es una app de iOS para limpiar fotos, videos y contactos, desarrollada por Kenan Artiran. La app funciona completamente en tu dispositivo: no se sube ningún dato a nuestros servidores." },
      { title: "2. Versión Gratuita", body: "La versión gratuita permite eliminar hasta 50 fotos o liberar 100 MB de almacenamiento. Al alcanzar este límite, se requiere actualizar a CleanU Premium para continuar. Contactos y Biblioteca Secreta son ilimitados en el plan gratuito." },
      { title: "3. CleanU Premium", body: "Premium está disponible como suscripción semanal (€4,99/semana, 7 días de prueba gratuita) o pago único de por vida (€34,99). El período de prueba se renueva automáticamente si no se cancela 24 horas antes. Los pagos son procesados por Apple." },
      { title: "4. Restaurar Compras", body: "Si ya compraste Premium, puedes restaurarlo desde la configuración de la app usando 'Restaurar Compras' con la misma Apple ID, sin costo." },
      { title: "5. Uso Aceptable", body: "Aceptas usar la app solo para fines legales. No puedes realizar ingeniería inversa, modificar ni redistribuir la app con fines comerciales." },
      { title: "6. Descargo de Responsabilidad", body: "CleanU no es responsable por fotos o datos eliminados accidentalmente. Asegúrate de tener una copia de seguridad antes de realizar limpiezas." },
      { title: "7. Cambios", body: "Podemos actualizar estos Términos en cualquier momento. Los cambios importantes se comunicarán en la app." },
      { title: "8. Contacto", body: "Para preguntas: kenanveo1907@gmail.com" },
    ],
  },

  fr: {
    heading: "Conditions d'utilisation",
    updated: "Dernière mise à jour : août 2026",
    sections: [
      { title: "1. À propos de CleanU", body: "CleanU est une application iOS de nettoyage de photos, contacts et e-mails, développée par Kenan Artiran. L'application fonctionne entièrement sur votre appareil — aucune donnée n'est téléchargée sur nos serveurs." },
      { title: "2. Version gratuite", body: "La version gratuite permet de supprimer jusqu'à 50 photos ou de libérer 100 Mo de stockage. Au-delà de cette limite, une mise à niveau vers CleanU Premium est requise. Le nettoyeur d'e-mails, les contacts et la bibliothèque secrète sont illimités dans le plan gratuit." },
      { title: "3. CleanU Premium", body: "Premium est disponible en abonnement hebdomadaire (4,99 €/semaine, 7 jours d'essai gratuit) ou en paiement unique à vie (34,99 €). L'essai se renouvelle automatiquement si non annulé 24 heures avant sa fin. Les paiements sont traités par Apple." },
      { title: "4. Restaurer les achats", body: "Si vous avez déjà acheté Premium, vous pouvez le restaurer depuis les paramètres de l'app via 'Restaurer les achats' avec le même identifiant Apple, gratuitement." },
      { title: "5. Utilisation acceptable", body: "Vous acceptez d'utiliser l'application uniquement à des fins légales. Vous ne pouvez pas effectuer d'ingénierie inverse, modifier ou redistribuer l'application à des fins commerciales." },
      { title: "6. Avertissement", body: "CleanU n'est pas responsable des photos ou données supprimées accidentellement. Assurez-vous d'avoir une sauvegarde avant d'effectuer des nettoyages." },
      { title: "7. Modifications", body: "Nous pouvons mettre à jour ces conditions à tout moment. Les changements importants seront communiqués dans l'application." },
      { title: "8. Contact", body: "Pour toute question : kenanveo1907@gmail.com" },
    ],
  },

  it: {
    heading: "Termini di Servizio",
    updated: "Ultimo aggiornamento: agosto 2026",
    sections: [
      { title: "1. Informazioni su CleanU", body: "CleanU è un'app iOS per la pulizia di foto, contatti ed email, sviluppata da Kenan Artiran. L'app funziona interamente sul dispositivo — nessun dato viene caricato sui nostri server." },
      { title: "2. Versione Gratuita", body: "La versione gratuita consente di eliminare fino a 50 foto o liberare 100 MB di spazio. Superato questo limite, è necessario un aggiornamento a CleanU Premium. Il Pulitore Email, i Contatti e la Libreria Segreta sono illimitati nel piano gratuito." },
      { title: "3. CleanU Premium", body: "Premium è disponibile come abbonamento settimanale (€4,99/settimana, 7 giorni di prova gratuita) o pagamento una tantum a vita (€34,99). Il periodo di prova si rinnova automaticamente se non annullato 24 ore prima. I pagamenti sono elaborati da Apple." },
      { title: "4. Ripristino acquisti", body: "Se hai già acquistato Premium, puoi ripristinarlo dalle impostazioni dell'app tramite 'Ripristina acquisti' con lo stesso ID Apple, gratuitamente." },
      { title: "5. Uso accettabile", body: "Accetti di utilizzare l'app solo per scopi leciti. Non puoi eseguire il reverse engineering, modificare o ridistribuire l'app per scopi commerciali." },
      { title: "6. Esclusione di responsabilità", body: "CleanU non è responsabile per foto o dati eliminati accidentalmente. Assicurati di avere un backup prima di eseguire pulizie." },
      { title: "7. Modifiche", body: "Possiamo aggiornare questi Termini in qualsiasi momento. Le modifiche importanti saranno comunicate nell'app." },
      { title: "8. Contatto", body: "Per domande: kenanveo1907@gmail.com" },
    ],
  },

  nl: {
    heading: "Gebruiksvoorwaarden",
    updated: "Laatste update: augustus 2026",
    sections: [
      { title: "1. Over CleanU", body: "CleanU is een iOS-app voor het opruimen van foto's, contacten en e-mails, ontwikkeld door Kenan Artiran. De app werkt volledig op uw apparaat — er worden geen gegevens naar onze servers geüpload." },
      { title: "2. Gratis versie", body: "De gratis versie staat toe om tot 50 foto's te verwijderen of 100 MB opslagruimte vrij te maken. Na het bereiken van deze limiet is een upgrade naar CleanU Premium vereist. E-mailreiniger, contacten en geheime bibliotheek zijn onbeperkt in het gratis plan." },
      { title: "3. CleanU Premium", body: "Premium is beschikbaar als wekelijks abonnement (€4,99/week, 7 dagen gratis proefperiode) of eenmalige levenslange betaling (€34,99). De proefperiode verlengt automatisch als deze niet 24 uur van tevoren wordt opgezegd. Betalingen worden verwerkt door Apple." },
      { title: "4. Aankopen herstellen", body: "Als u Premium al heeft aangeschaft, kunt u dit gratis herstellen via 'Aankopen herstellen' in de app-instellingen met dezelfde Apple ID." },
      { title: "5. Acceptabel gebruik", body: "U stemt ermee in de app alleen voor wettige doeleinden te gebruiken. U mag de app niet reverse-engineeren, wijzigen of voor commerciële doeleinden verspreiden." },
      { title: "6. Disclaimer", body: "CleanU is niet aansprakelijk voor per ongeluk verwijderde foto's of gegevens. Zorg voor een back-up van belangrijke inhoud voordat u opruimt." },
      { title: "7. Wijzigingen", body: "We kunnen deze voorwaarden op elk moment bijwerken. Belangrijke wijzigingen worden in de app gecommuniceerd." },
      { title: "8. Contact", body: "Voor vragen: kenanveo1907@gmail.com" },
    ],
  },

  pl: {
    heading: "Warunki korzystania",
    updated: "Ostatnia aktualizacja: sierpień 2026",
    sections: [
      { title: "1. O CleanU", body: "CleanU to aplikacja iOS do czyszczenia zdjęć, kontaktów i e-maili, opracowana przez Kenana Artirana. Aplikacja działa wyłącznie na urządzeniu — żadne dane nie są przesyłane na nasze serwery." },
      { title: "2. Wersja darmowa", body: "Wersja darmowa pozwala usunąć do 50 zdjęć lub zwolnić 100 MB miejsca. Po osiągnięciu tego limitu wymagane jest uaktualnienie do CleanU Premium. Czyszczenie e-maili, kontakty i tajna biblioteka są nieograniczone w darmowym planie." },
      { title: "3. CleanU Premium", body: "Premium jest dostępne jako subskrypcja tygodniowa (4,99 €/tydzień, 7-dniowy bezpłatny okres próbny) lub jednorazowa opłata dożywotnia (34,99 €). Okres próbny odnawia się automatycznie, jeśli nie zostanie anulowany 24 godziny przed końcem. Płatności są przetwarzane przez Apple." },
      { title: "4. Przywracanie zakupów", body: "Jeśli kupiłeś już Premium, możesz je przywrócić bezpłatnie z ustawień aplikacji za pomocą tej samej Apple ID." },
      { title: "5. Dopuszczalne użytkowanie", body: "Zgadzasz się używać aplikacji wyłącznie do celów zgodnych z prawem. Nie możesz inżynierować wstecznie, modyfikować ani rozpowszechniać aplikacji w celach komercyjnych." },
      { title: "6. Wyłączenie odpowiedzialności", body: "CleanU nie ponosi odpowiedzialności za przypadkowo usunięte zdjęcia lub dane. Wykonaj kopię zapasową ważnych treści przed czyszczeniem." },
      { title: "7. Zmiany", body: "Możemy aktualizować te warunki w dowolnym momencie. Istotne zmiany będą komunikowane w aplikacji." },
      { title: "8. Kontakt", body: "W razie pytań: kenanveo1907@gmail.com" },
    ],
  },

  pt: {
    heading: "Termos de Serviço",
    updated: "Última atualização: agosto de 2026",
    sections: [
      { title: "1. Sobre o CleanU", body: "CleanU é um aplicativo iOS para limpar fotos, contatos e e-mails, desenvolvido por Kenan Artiran. O app funciona inteiramente no seu dispositivo — nenhum dado é enviado para nossos servidores." },
      { title: "2. Versão Gratuita", body: "A versão gratuita permite excluir até 50 fotos ou liberar 100 MB de armazenamento. Após atingir esse limite, é necessário atualizar para o CleanU Premium. O limpador de e-mail, contatos e biblioteca secreta são ilimitados no plano gratuito." },
      { title: "3. CleanU Premium", body: "O Premium está disponível como assinatura semanal (€4,99/semana, 7 dias de teste gratuito) ou pagamento único vitalício (€34,99). O período de teste renova automaticamente se não for cancelado 24 horas antes do término. Os pagamentos são processados pela Apple." },
      { title: "4. Restaurar Compras", body: "Se você já comprou o Premium, pode restaurá-lo gratuitamente nas configurações do app usando 'Restaurar Compras' com o mesmo Apple ID." },
      { title: "5. Uso Aceitável", body: "Você concorda em usar o app apenas para fins legais. Você não pode fazer engenharia reversa, modificar ou redistribuir o app para fins comerciais." },
      { title: "6. Aviso Legal", body: "O CleanU não se responsabiliza por fotos ou dados excluídos acidentalmente. Certifique-se de ter um backup antes de realizar limpezas." },
      { title: "7. Alterações", body: "Podemos atualizar estes Termos a qualquer momento. Mudanças importantes serão comunicadas no app." },
      { title: "8. Contato", body: "Para dúvidas: kenanveo1907@gmail.com" },
    ],
  },

  ru: {
    heading: "Условия использования",
    updated: "Последнее обновление: август 2026",
    sections: [
      { title: "1. О CleanU", body: "CleanU — приложение для iOS по очистке фотографий, контактов и электронной почты, разработанное Кенаном Артираном. Приложение работает полностью на вашем устройстве — никакие данные не загружаются на наши серверы." },
      { title: "2. Бесплатная версия", body: "Бесплатная версия позволяет удалить до 50 фотографий или освободить 100 МБ памяти. После достижения этого лимита для продолжения очистки требуется обновление до CleanU Premium. Очиститель электронной почты, контакты и секретная библиотека безлимитны в бесплатном плане." },
      { title: "3. CleanU Premium", body: "Premium доступен как еженедельная подписка (4,99 €/неделю, 7 дней бесплатного пробного периода) или единовременный пожизненный платёж (34,99 €). Пробный период автоматически продлевается, если не отменить его за 24 часа до окончания. Платежи обрабатываются Apple." },
      { title: "4. Восстановление покупок", body: "Если вы уже приобрели Premium, вы можете восстановить его бесплатно в настройках приложения через 'Восстановить покупки' с тем же Apple ID." },
      { title: "5. Допустимое использование", body: "Вы соглашаетесь использовать приложение только в законных целях. Вам запрещено осуществлять обратное проектирование, изменять или распространять приложение в коммерческих целях." },
      { title: "6. Отказ от ответственности", body: "CleanU не несёт ответственности за случайно удалённые фотографии или данные. Убедитесь в наличии резервной копии важного контента перед очисткой." },
      { title: "7. Изменения", body: "Мы можем обновить настоящие Условия в любое время. О существенных изменениях будет сообщено в приложении." },
      { title: "8. Контакт", body: "По вопросам: kenanveo1907@gmail.com" },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PRIVACY POLICY
// ─────────────────────────────────────────────────────────────────────────────
export const PRIVACY: Record<string, LegalDoc> = {
  de: {
    heading: "Datenschutzerklärung",
    updated: "Stand: August 2026",
    sections: [
      {
        title: "1. Überblick",
        body: "CleanU wurde mit Datenschutz als Grundprinzip entwickelt. Deine Fotos, Videos und Kontakte verlassen niemals dein Gerät. Wir erheben keine persönlich identifizierbaren Informationen.",
      },
      {
        title: "2. Welche Daten wir erheben",
        body: "Wir erheben ausschließlich:\n• Geräte-ID (anonym, zufällig generiert — kein Bezug zu deiner Person)\n• Nutzungsdaten: Anzahl gelöschter Fotos, freigegebene MB-Menge (nur Zähler, kein Inhalt)\n• App-Events: z.B. 'Scan gestartet', 'Paywall geöffnet' (anonyme Nutzungsanalyse)\n\nKeine Namen, E-Mail-Adressen, Fotos, Video-Inhalte oder sonstige persönliche Daten.",
      },
      {
        title: "3. Fotos & Mediathek",
        body: "CleanU benötigt Zugriff auf deine Fotomediathek, um Duplikate, Screenshots und ähnliche Fotos zu erkennen. Alle Analysen erfolgen lokal auf deinem Gerät. Kein Foto und kein Video wird jemals auf externe Server übertragen, gespeichert oder analysiert.",
      },
      {
        title: "4. Kontakte",
        body: "Der Kontakte-Manager liest deine Kontakte lokal aus und analysiert sie auf Duplikate und unvollständige Einträge. Kontaktdaten werden nicht auf Server übertragen und nicht dauerhaft gespeichert.",
      },
      {
        title: "5. Geheime Bibliothek",
        body: "Fotos und Videos in der Geheimen Bibliothek werden ausschließlich lokal im geschützten Dokumentenordner deiner App gespeichert. Sie verlassen niemals dein Gerät. Der PIN wird lokal in der iOS-Keychain gesichert.",
      },
      {
        title: "7. In-App-Käufe",
        body: "Zahlungen für CleanU Premium werden vollständig über Apple abgewickelt. Wir erhalten keine Zahlungsdaten, Kreditkarteninformationen oder sonstige finanzielle Informationen.",
      },
      {
        title: "8. Drittanbieter",
        body: "Wir nutzen keine externen Tracking-SDKs (kein Facebook, Google Analytics, Firebase Analytics o.Ä.). Unsere einzige externe Verbindung ist der CleanU-Backend-Server für anonyme Nutzungsstatistiken und Premium-Status-Verwaltung.",
      },
      {
        title: "9. Datenspeicherung & Löschung",
        body: "Anonyme Nutzungsdaten werden auf unserem Server für maximal 12 Monate gespeichert. Beim Deinstallieren der App werden alle lokalen Daten von deinem Gerät entfernt. Für eine vollständige Datenlöschung vom Server sende eine Anfrage an: kenanveo1907@gmail.com",
      },
      {
        title: "10. Kontakt",
        body: "Bei Datenschutzfragen erreichst du uns unter: kenanveo1907@gmail.com\n\nKenan Artiran · kenanplayer.com",
      },
    ],
  },

  en: {
    heading: "Privacy Policy",
    updated: "Last updated: August 2026",
    sections: [
      { title: "1. Overview", body: "CleanU was built with privacy as a core principle. Your photos, videos, and contacts never leave your device. We do not collect personally identifiable information." },
      { title: "2. Data We Collect", body: "We collect only:\n• Device ID (anonymous, randomly generated — not linked to you personally)\n• Usage data: number of photos deleted, MB freed (counters only, no content)\n• App events: e.g. 'scan started', 'paywall opened' (anonymous analytics)\n\nNo names, email addresses, photo content, video content, or other personal data." },
      { title: "3. Photos & Media Library", body: "CleanU requires access to your photo library to detect duplicates, screenshots, and similar photos. All analysis is performed locally on your device. No photo or video is ever transmitted to, stored on, or analyzed by external servers." },
      { title: "5. Contacts", body: "The Contacts Manager reads your contacts locally and analyzes them for duplicates and incomplete entries. Contact data is never transmitted to servers or permanently stored." },
      { title: "6. Secret Library", body: "Photos and videos in the Secret Library are stored exclusively locally in your app's protected documents folder. They never leave your device. The PIN is stored locally in the iOS Keychain." },
      { title: "7. In-App Purchases", body: "Payments for CleanU Premium are handled entirely by Apple. We receive no payment data, credit card information, or other financial information." },
      { title: "8. Third Parties", body: "We do not use any external tracking SDKs (no Facebook, Google Analytics, Firebase Analytics, etc.). Our only external connection is the CleanU backend server for anonymous usage statistics and Premium status management." },
      { title: "9. Data Retention & Deletion", body: "Anonymous usage data is stored on our server for up to 12 months. Uninstalling the app removes all local data from your device. For complete server-side deletion, send a request to: kenanveo1907@gmail.com" },
      { title: "10. Contact", body: "For privacy inquiries: kenanveo1907@gmail.com\n\nKenan Artiran · kenanplayer.com" },
    ],
  },

  tr: {
    heading: "Gizlilik Politikası",
    updated: "Son güncelleme: Ağustos 2026",
    sections: [
      { title: "1. Genel Bakış", body: "CleanU, gizliliği temel ilke olarak benimseyerek geliştirilmiştir. Fotoğraflarınız, videolarınız, kişileriniz ve e-postalarınız asla cihazınızı terk etmez. Kişisel olarak tanımlanabilir bilgi toplamıyoruz." },
      { title: "2. Topladığımız Veriler", body: "Yalnızca şunları topluyoruz:\n• Cihaz kimliği (anonim, rastgele oluşturulmuş — sizinle kişisel olarak ilişkili değil)\n• Kullanım verileri: silinen fotoğraf sayısı, boşaltılan MB miktarı (yalnızca sayaçlar)\n• Uygulama olayları: ör. 'tarama başlatıldı', 'ödeme ekranı açıldı' (anonim analitik)\n\nHiçbir isim, e-posta adresi, fotoğraf içeriği veya kişisel veri toplanmaz." },
      { title: "3. Fotoğraflar ve Medya Kütüphanesi", body: "CleanU, yinelenen, ekran görüntüsü ve benzer fotoğrafları tespit etmek için fotoğraf kütüphanenize erişim gerektirir. Tüm analizler cihazınızda yerel olarak gerçekleştirilir. Hiçbir fotoğraf veya video asla harici sunuculara aktarılmaz." },
      { title: "5. Kişiler", body: "Kişi Yöneticisi, kişilerinizi yerel olarak okur ve yinelenenleri ile eksik girişleri analiz eder. Kişi verileri sunuculara aktarılmaz." },
      { title: "6. Gizli Kütüphane", body: "Gizli Kütüphane'deki fotoğraf ve videolar yalnızca uygulamanızın korumalı belgeler klasöründe yerel olarak saklanır. Asla cihazınızı terk etmezler." },
      { title: "7. Uygulama İçi Satın Almalar", body: "CleanU Premium ödemeleri tamamen Apple tarafından işlenir. Ödeme verisi, kredi kartı bilgisi veya finansal bilgi almıyoruz." },
      { title: "8. Üçüncü Taraflar", body: "Harici izleme SDK'ları kullanmıyoruz (Facebook, Google Analytics, Firebase Analytics yok). Tek harici bağlantımız, anonim kullanım istatistikleri ve Premium durumu yönetimi için CleanU arka uç sunucusudur." },
      { title: "9. Veri Saklama ve Silme", body: "Anonim kullanım verileri sunucumuzda en fazla 12 ay saklanır. Uygulamayı kaldırmak tüm yerel verileri kaldırır. Sunucu tarafında tam silme için: kenanveo1907@gmail.com" },
      { title: "10. İletişim", body: "Gizlilik soruları için: kenanveo1907@gmail.com\n\nKenan Artiran · kenanplayer.com" },
    ],
  },

  es: {
    heading: "Política de Privacidad",
    updated: "Última actualización: agosto 2026",
    sections: [
      { title: "1. Resumen", body: "CleanU fue desarrollado con la privacidad como principio fundamental. Tus fotos, videos, contactos y correos nunca abandonan tu dispositivo. No recopilamos información de identificación personal." },
      { title: "2. Datos que recopilamos", body: "Solo recopilamos:\n• ID de dispositivo (anónimo, generado aleatoriamente)\n• Datos de uso: número de fotos eliminadas, MB liberados (solo contadores)\n• Eventos de la app: análisis anónimos\n\nNingún nombre, correo electrónico, contenido de fotos ni datos personales." },
      { title: "3. Fotos y Biblioteca", body: "CleanU necesita acceso a tu biblioteca de fotos para detectar duplicados y similares. Todo el análisis se realiza localmente. Ninguna foto se transmite a servidores externos." },
      { title: "5. Contactos", body: "El Gestor de Contactos lee tus contactos localmente. Los datos de contacto nunca se transmiten a servidores." },
      { title: "6. Biblioteca Secreta", body: "Las fotos y videos en la Biblioteca Secreta se almacenan localmente en la carpeta protegida de la app. Nunca abandonan tu dispositivo." },
      { title: "7. Compras dentro de la app", body: "Los pagos de CleanU Premium son gestionados íntegramente por Apple. No recibimos datos de pago ni información financiera." },
      { title: "8. Terceros", body: "No usamos SDKs de seguimiento externos. Nuestra única conexión externa es el servidor CleanU para estadísticas anónimas y gestión del estado Premium." },
      { title: "9. Retención y Eliminación", body: "Los datos de uso anónimos se almacenan hasta 12 meses. Desinstalar la app elimina todos los datos locales. Para eliminación completa: kenanveo1907@gmail.com" },
      { title: "10. Contacto", body: "Para consultas de privacidad: kenanveo1907@gmail.com\n\nKenan Artiran · kenanplayer.com" },
    ],
  },

  fr: {
    heading: "Politique de confidentialité",
    updated: "Dernière mise à jour : août 2026",
    sections: [
      { title: "1. Vue d'ensemble", body: "CleanU a été développé avec la confidentialité comme principe fondamental. Vos photos, vidéos, contacts et e-mails ne quittent jamais votre appareil. Nous ne collectons aucune information personnellement identifiable." },
      { title: "2. Données collectées", body: "Nous collectons uniquement :\n• ID d'appareil (anonyme, généré aléatoirement)\n• Données d'utilisation : nombre de photos supprimées, Mo libérés (compteurs uniquement)\n• Événements de l'app : analyses anonymes\n\nAucun nom, adresse e-mail, contenu photo ni données personnelles." },
      { title: "3. Photos et médiathèque", body: "CleanU nécessite l'accès à votre photothèque pour détecter les doublons et photos similaires. Toutes les analyses sont effectuées localement. Aucune photo n'est transmise à des serveurs externes." },
      { title: "5. Contacts", body: "Le gestionnaire de contacts lit vos contacts localement. Les données de contact ne sont jamais transmises à des serveurs." },
      { title: "6. Bibliothèque secrète", body: "Les photos et vidéos de la bibliothèque secrète sont stockées localement dans le dossier protégé de l'app. Elles ne quittent jamais votre appareil." },
      { title: "7. Achats intégrés", body: "Les paiements pour CleanU Premium sont entièrement gérés par Apple. Nous ne recevons aucune donnée de paiement ni information financière." },
      { title: "8. Tiers", body: "Nous n'utilisons aucun SDK de suivi externe. Notre seule connexion externe est le serveur CleanU pour les statistiques anonymes et la gestion du statut Premium." },
      { title: "9. Conservation et suppression", body: "Les données d'utilisation anonymes sont conservées jusqu'à 12 mois. La désinstallation de l'app supprime toutes les données locales. Pour une suppression complète : kenanveo1907@gmail.com" },
      { title: "10. Contact", body: "Pour les demandes de confidentialité : kenanveo1907@gmail.com\n\nKenan Artiran · kenanplayer.com" },
    ],
  },

  it: {
    heading: "Informativa sulla privacy",
    updated: "Ultimo aggiornamento: agosto 2026",
    sections: [
      { title: "1. Panoramica", body: "CleanU è stato sviluppato con la privacy come principio fondamentale. Le tue foto, video, contatti ed e-mail non lasciano mai il tuo dispositivo. Non raccogliamo informazioni personalmente identificabili." },
      { title: "2. Dati che raccogliamo", body: "Raccogliamo solo:\n• ID dispositivo (anonimo, generato casualmente)\n• Dati di utilizzo: numero di foto eliminate, MB liberati (solo contatori)\n• Eventi dell'app: analisi anonime\n\nNessun nome, indirizzo e-mail, contenuto fotografico o dati personali." },
      { title: "3. Foto e libreria", body: "CleanU richiede accesso alla tua libreria foto per rilevare duplicati e foto simili. Tutte le analisi vengono eseguite localmente. Nessuna foto viene trasmessa a server esterni." },
      { title: "5. Contatti", body: "Il Gestore Contatti legge i tuoi contatti localmente. I dati dei contatti non vengono mai trasmessi a server." },
      { title: "6. Libreria Segreta", body: "Le foto e i video nella Libreria Segreta sono memorizzati localmente nella cartella protetta dell'app. Non lasciano mai il tuo dispositivo." },
      { title: "7. Acquisti in-app", body: "I pagamenti per CleanU Premium sono gestiti interamente da Apple. Non riceviamo dati di pagamento né informazioni finanziarie." },
      { title: "8. Terze parti", body: "Non utilizziamo SDK di tracciamento esterni. La nostra unica connessione esterna è il server CleanU per statistiche anonime e gestione dello stato Premium." },
      { title: "9. Conservazione ed eliminazione", body: "I dati di utilizzo anonimi sono conservati fino a 12 mesi. La disinstallazione dell'app rimuove tutti i dati locali. Per l'eliminazione completa: kenanveo1907@gmail.com" },
      { title: "10. Contatto", body: "Per richieste sulla privacy: kenanveo1907@gmail.com\n\nKenan Artiran · kenanplayer.com" },
    ],
  },

  nl: {
    heading: "Privacybeleid",
    updated: "Laatste update: augustus 2026",
    sections: [
      { title: "1. Overzicht", body: "CleanU is ontwikkeld met privacy als kernprincipe. Uw foto's, video's, contacten en e-mails verlaten nooit uw apparaat. We verzamelen geen persoonlijk identificeerbare informatie." },
      { title: "2. Gegevens die we verzamelen", body: "We verzamelen alleen:\n• Apparaat-ID (anoniem, willekeurig gegenereerd)\n• Gebruiksgegevens: aantal verwijderde foto's, vrijgemaakte MB (alleen tellers)\n• App-events: anonieme analyses\n\nGeen namen, e-mailadressen, foto-inhoud of persoonlijke gegevens." },
      { title: "3. Foto's en mediabibliotheek", body: "CleanU vereist toegang tot uw fotobibliotheek om duplicaten en vergelijkbare foto's te detecteren. Alle analyses worden lokaal uitgevoerd. Geen foto wordt verzonden naar externe servers." },
      { title: "5. Contacten", body: "De contactbeheerder leest uw contacten lokaal. Contactgegevens worden nooit naar servers verzonden." },
      { title: "6. Geheime bibliotheek", body: "Foto's en video's in de geheime bibliotheek worden lokaal opgeslagen in de beveiligde map van de app. Ze verlaten nooit uw apparaat." },
      { title: "7. In-app aankopen", body: "Betalingen voor CleanU Premium worden volledig verwerkt door Apple. We ontvangen geen betalingsgegevens of financiële informatie." },
      { title: "8. Derden", body: "We gebruiken geen externe tracking-SDK's. Onze enige externe verbinding is de CleanU-server voor anonieme statistieken en Premium-statusbeheer." },
      { title: "9. Gegevensretentie en verwijdering", body: "Anonieme gebruiksgegevens worden tot 12 maanden bewaard. Verwijdering van de app verwijdert alle lokale gegevens. Voor volledige verwijdering: kenanveo1907@gmail.com" },
      { title: "10. Contact", body: "Voor privacyvragen: kenanveo1907@gmail.com\n\nKenan Artiran · kenanplayer.com" },
    ],
  },

  pl: {
    heading: "Polityka prywatności",
    updated: "Ostatnia aktualizacja: sierpień 2026",
    sections: [
      { title: "1. Przegląd", body: "CleanU zostało opracowane z prywatnością jako podstawową zasadą. Twoje zdjęcia, filmy, kontakty i e-maile nigdy nie opuszczają Twojego urządzenia. Nie zbieramy danych osobowych." },
      { title: "2. Zbierane dane", body: "Zbieramy tylko:\n• ID urządzenia (anonimowe, losowo generowane)\n• Dane użytkowania: liczba usuniętych zdjęć, zwolnione MB (tylko liczniki)\n• Zdarzenia aplikacji: anonimowe analizy\n\nŻadnych imion, adresów e-mail, treści zdjęć ani danych osobowych." },
      { title: "3. Zdjęcia i biblioteka", body: "CleanU wymaga dostępu do biblioteki zdjęć, aby wykrywać duplikaty i podobne zdjęcia. Wszystkie analizy są wykonywane lokalnie. Żadne zdjęcie nie jest przesyłane do zewnętrznych serwerów." },
      { title: "5. Kontakty", body: "Menedżer kontaktów odczytuje kontakty lokalnie. Dane kontaktowe nigdy nie są przesyłane na serwery." },
      { title: "6. Tajna biblioteka", body: "Zdjęcia i filmy w tajnej bibliotece są przechowywane lokalnie w chronionej lokalizacji aplikacji. Nigdy nie opuszczają Twojego urządzenia." },
      { title: "7. Zakupy w aplikacji", body: "Płatności za CleanU Premium są w całości obsługiwane przez Apple. Nie otrzymujemy żadnych danych płatniczych ani finansowych." },
      { title: "8. Strony trzecie", body: "Nie używamy zewnętrznych SDK do śledzenia. Jedynym połączeniem zewnętrznym jest serwer CleanU dla anonimowych statystyk i zarządzania statusem Premium." },
      { title: "9. Przechowywanie i usuwanie danych", body: "Anonimowe dane użytkowania są przechowywane do 12 miesięcy. Odinstalowanie aplikacji usuwa wszystkie lokalne dane. W celu pełnego usunięcia: kenanveo1907@gmail.com" },
      { title: "10. Kontakt", body: "W sprawie prywatności: kenanveo1907@gmail.com\n\nKenan Artiran · kenanplayer.com" },
    ],
  },

  pt: {
    heading: "Política de Privacidade",
    updated: "Última atualização: agosto de 2026",
    sections: [
      { title: "1. Visão geral", body: "CleanU foi desenvolvido com privacidade como princípio fundamental. Suas fotos, vídeos, contatos e e-mails nunca saem do seu dispositivo. Não coletamos informações pessoalmente identificáveis." },
      { title: "2. Dados que coletamos", body: "Coletamos apenas:\n• ID do dispositivo (anônimo, gerado aleatoriamente)\n• Dados de uso: número de fotos excluídas, MB liberados (apenas contadores)\n• Eventos do app: análises anônimas\n\nNenhum nome, e-mail, conteúdo de fotos ou dados pessoais." },
      { title: "3. Fotos e biblioteca", body: "CleanU requer acesso à biblioteca de fotos para detectar duplicatas e fotos similares. Toda análise é feita localmente. Nenhuma foto é transmitida a servidores externos." },
      { title: "5. Contatos", body: "O gerenciador de contatos lê seus contatos localmente. Os dados de contato nunca são transmitidos a servidores." },
      { title: "6. Biblioteca Secreta", body: "Fotos e vídeos na Biblioteca Secreta são armazenados localmente na pasta protegida do app. Nunca saem do seu dispositivo." },
      { title: "7. Compras no aplicativo", body: "Os pagamentos do CleanU Premium são totalmente gerenciados pela Apple. Não recebemos dados de pagamento nem informações financeiras." },
      { title: "8. Terceiros", body: "Não usamos SDKs de rastreamento externos. Nossa única conexão externa é o servidor CleanU para estatísticas anônimas e gerenciamento do status Premium." },
      { title: "9. Retenção e exclusão", body: "Dados de uso anônimos são armazenados por até 12 meses. Desinstalar o app remove todos os dados locais. Para exclusão completa: kenanveo1907@gmail.com" },
      { title: "10. Contato", body: "Para dúvidas de privacidade: kenanveo1907@gmail.com\n\nKenan Artiran · kenanplayer.com" },
    ],
  },

  ru: {
    heading: "Политика конфиденциальности",
    updated: "Последнее обновление: август 2026",
    sections: [
      { title: "1. Обзор", body: "CleanU разработан с конфиденциальностью как основным принципом. Ваши фотографии, видео, контакты и электронные письма никогда не покидают ваше устройство. Мы не собираем персональные данные." },
      { title: "2. Собираемые данные", body: "Мы собираем только:\n• ID устройства (анонимный, случайно сгенерированный)\n• Данные об использовании: количество удалённых фото, освобождённые МБ (только счётчики)\n• События приложения: анонимная аналитика\n\nНикаких имён, адресов электронной почты, содержимого фотографий или личных данных." },
      { title: "3. Фотографии и библиотека", body: "CleanU требует доступа к библиотеке фотографий для обнаружения дубликатов и похожих фото. Весь анализ выполняется локально на вашем устройстве. Ни одна фотография не передаётся на внешние серверы." },
      
      { title: "5. Контакты", body: "Менеджер контактов читает контакты локально. Данные контактов никогда не передаются на серверы." },
      { title: "6. Тайная библиотека", body: "Фотографии и видео в тайной библиотеке хранятся исключительно локально в защищённой папке приложения. Они никогда не покидают ваше устройство." },
      { title: "7. Покупки в приложении", body: "Платежи за CleanU Premium полностью обрабатываются Apple. Мы не получаем никаких платёжных данных или финансовой информации." },
      { title: "8. Третьи стороны", body: "Мы не используем внешние SDK для отслеживания. Наше единственное внешнее подключение — сервер CleanU для анонимной статистики и управления статусом Premium." },
      { title: "9. Хранение и удаление данных", body: "Анонимные данные об использовании хранятся до 12 месяцев. Удаление приложения удаляет все локальные данные. Для полного удаления с сервера: kenanveo1907@gmail.com" },
      { title: "10. Контакт", body: "По вопросам конфиденциальности: kenanveo1907@gmail.com\n\nKenan Artiran · kenanplayer.com" },
    ],
  },
};
