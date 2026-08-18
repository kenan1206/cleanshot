// Web stub
import { View } from "react-native";
import { StyleProp, ViewStyle } from "react-native";
import { Image as ExpoImage } from "expo-image";

export default function LiveVideoThumb({ uri, style }: { uri: string; style?: StyleProp<ViewStyle>; isVisible?: boolean }) {
  return <ExpoImage source={{ uri }} style={style as any} contentFit="cover" />;
}
