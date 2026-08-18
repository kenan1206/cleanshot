// Native-only: expo-video mit useVideoPlayer Hook
// isActive: nur das aktuell sichtbare Video spielt — verhindert mehrfache Audios
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect } from "react";
import { Dimensions } from "react-native";

const { width: W, height: H } = Dimensions.get("window");

export default function VideoPlayerNative({ uri, isActive = true }: { uri: string; isActive?: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    // Kein auto-play hier — wird über isActive gesteuert
  });

  useEffect(() => {
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, player]);

  return (
    <VideoView
      player={player}
      style={{ width: W, height: H }}
      contentFit="contain"
      nativeControls
    />
  );
}
