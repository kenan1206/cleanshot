// Web stub — expo-video hat kein Web-Support
import { View, Text } from "react-native";
import { Dimensions } from "react-native";
import { useTranslation } from "react-i18next";

const { width: W, height: H } = Dimensions.get("window");

export default function VideoPlayerNative({ uri: _, isActive: __ }: { uri: string; isActive?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={{ width: W, height: H, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#888", fontSize: 14 }}>{t("common.video_ios_only")}</Text>
    </View>
  );
}
