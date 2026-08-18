import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useApp } from "@/src/context/AppContext";
import { useTheme } from "@/src/theme/ThemeContext";

export default function Index() {
  const { ready, user, trackEvent } = useApp();
  const t = useTheme();

  useEffect(() => {
    if (ready) {
      trackEvent("app_open");
    }
  }, [ready, trackEvent]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.surface }}>
        <ActivityIndicator color={t.colors.brandPrimary} />
      </View>
    );
  }

  if (!user?.onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
