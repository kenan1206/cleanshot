import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { LogBox, View, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { ThemeProvider } from "@/src/theme/ThemeContext";
import { AppProvider, useApp } from "@/src/context/AppContext";
import { initI18n } from "@/src/i18n";
import AnimatedSplash from "@/src/components/AnimatedSplash";
import { initRevenueCat, RevenueCatProvider } from "@/src/lib/revenuecat";

LogBox.ignoreAllLogs(true);

// Init RevenueCat at module scope — BEFORE any component mounts
try { initRevenueCat(); } catch (e) { console.warn("[RC] init error:", e); }

SplashScreen.preventAutoHideAsync();

// Inner wrapper so we can access deviceId from AppProvider
function RCWrapper({ children }: { children: React.ReactNode }) {
  const { deviceId } = useApp();
  return <RevenueCatProvider userId={deviceId}>{children}</RevenueCatProvider>;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [i18nReady, setI18nReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    initI18n().finally(() => setI18nReady(true));
  }, []);

  useEffect(() => {
    if ((loaded || error) && i18nReady) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error, i18nReady]);

  if ((!loaded && !error) || !i18nReady) return (
    <View style={{ flex: 1, backgroundColor: "#2A50D9" }} />
  );

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0A0C14" }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppProvider>
            <RCWrapper>
              <BottomSheetModalProvider>
                <StatusBar style="auto" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: "transparent" },
                    animation: "slide_from_right",
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
                  <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
                  <Stack.Screen name="category/[type]" />
                  <Stack.Screen name="swipe/[type]" />
                  <Stack.Screen name="success" options={{ animation: "fade" }} />
                  <Stack.Screen
                    name="paywall"
                    options={{ presentation: "modal", animation: "slide_from_bottom" }}
                  />
                </Stack>
                {!splashDone && (
                  <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                    <AnimatedSplash onFinish={() => setSplashDone(true)} />
                  </View>
                )}
              </BottomSheetModalProvider>
            </RCWrapper>
          </AppProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
