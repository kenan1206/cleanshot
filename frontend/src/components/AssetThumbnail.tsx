// Renders a MediaLibrary photo/video asset as a FAST, memory-safe thumbnail.
// Uses expo-image for ALL platforms — handles ph:// correctly on New Architecture.
import React from "react";
import { StyleProp, ImageStyle } from "react-native";
import { Image } from "expo-image";
import { PhotoAsset } from "@/src/utils/photos";

export default function AssetThumbnail({
  asset,
  style,
  testID,
}: {
  asset: PhotoAsset;
  style?: StyleProp<ImageStyle>;
  testID?: string;
}) {
  return (
    <Image
      source={{ uri: asset.uri }}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={asset.id}
      transition={100}
      testID={testID}
    />
  );
}
