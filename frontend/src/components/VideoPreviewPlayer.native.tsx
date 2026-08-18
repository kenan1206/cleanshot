// Native-only: Video Player für Preview Modal
// Verwendet ph:// URI direkt — wie LiveVideoThumb.native.tsx
// getAssetInfoAsync ist NICHT nötig für Playback
import { VideoView, useVideoPlayer } from "expo-video";
import { StyleSheet } from "react-native";

export default function VideoPreviewPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={styles.video}
      contentFit="contain"
      nativeControls
    />
  );
}

const styles = StyleSheet.create({
  video: { flex: 1, width: "100%" },
});
