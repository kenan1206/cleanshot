// RevenueCat — IAP / Subscription Management
// Source of truth for premium status: RC entitlements (never backend flags)
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from "react-native-purchases";

// ── Config ──────────────────────────────────────────────────────────────────
const TEST_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY ?? "";
const IOS_KEY  = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? "";

// Use iOS key on real device (both debug + release) — sandbox purchases still work with sandbox Apple ID.
// Only use the test key on the web preview.
function getApiKey(): string {
  if (Platform.OS === "web") return TEST_KEY;
  if (Platform.OS === "ios") return IOS_KEY;
  return TEST_KEY;
}

export const RC_ENTITLEMENT = "CleanU Pro"; // must match RC dashboard identifier

// This must be based on the key for the current platform. Using `TEST_KEY || IOS_KEY`
// here can make an iOS release appear configured while configure() receives an
// empty iOS key, causing every production offering request to fail.
const ACTIVE_API_KEY = getApiKey();
export const rcEnabled = !!ACTIVE_API_KEY;

// Call at module scope in _layout.tsx BEFORE any component mounts
export function initRevenueCat() {
  if (!rcEnabled) return;
  try {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: ACTIVE_API_KEY });
  } catch (e) {
    console.warn("[RevenueCat] init failed:", e);
  }
}

// ── Context ──────────────────────────────────────────────────────────────────
type RCContextValue = {
  isSubscribed: boolean;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOfferings | null;
  isLoading: boolean;
  identityReady: boolean;
  identityError: string | null;
  purchase: (pkg: PurchasesPackage) => Promise<CustomerInfo>;
  restore: () => Promise<CustomerInfo>;
  isPurchasing: boolean;
  isRestoring: boolean;
};

const RCContext = createContext<RCContextValue | null>(null);

export function RevenueCatProvider({ children, userId }: { children: React.ReactNode; userId: string | null }) {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const boundUserId = useRef<string | null>(null);

  // Load offerings once
  useEffect(() => {
    if (!rcEnabled) { setIsLoading(false); return; }
    Purchases.getOfferings()
      .then(setOfferings)
      .catch((e) => console.warn("[RC] getOfferings failed:", e))
      .finally(() => setIsLoading(false));
  }, []);

  // Reactive customerInfo updates
  useEffect(() => {
    if (!rcEnabled) return;
    const listener = (info: CustomerInfo) => setCustomerInfo(info);
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  // Identity: logIn when userId is available
  useEffect(() => {
    if (!rcEnabled || !userId) return;
    if (boundUserId.current === userId) return;
    (async () => {
      try {
        const { customerInfo: info } = await Purchases.logIn(userId);
        boundUserId.current = userId;
        setCustomerInfo(info);
        setIdentityError(null);
      } catch (e) {
        setIdentityError(String(e));
        console.warn("[RC] logIn failed:", e);
      }
    })();
  }, [userId]);

  const isSubscribed = !!(customerInfo?.entitlements.active?.[RC_ENTITLEMENT]);
  const identityReady = !!boundUserId.current && boundUserId.current === userId;

  const purchase = async (pkg: PurchasesPackage): Promise<CustomerInfo> => {
    setIsPurchasing(true);
    try {
      const { customerInfo: info } = await Purchases.purchasePackage(pkg);
      setCustomerInfo(info);
      return info;
    } finally {
      setIsPurchasing(false);
    }
  };

  const restore = async (): Promise<CustomerInfo> => {
    setIsRestoring(true);
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      return info;
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <RCContext.Provider value={{
      isSubscribed, customerInfo, offerings, isLoading,
      identityReady, identityError,
      purchase, restore, isPurchasing, isRestoring,
    }}>
      {children}
    </RCContext.Provider>
  );
}

export function useRevenueCat() {
  const ctx = useContext(RCContext);
  if (!ctx) throw new Error("useRevenueCat must be used inside RevenueCatProvider");
  return ctx;
}
