// Live Video-Vorschau im Grid — spielt stumm in Echtzeit
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect } from "react";
import { StyleProp, ViewStyle } from "react-native";

interface Props {
  uri: string;
  style?: StyleProp<ViewStyle>;
  isVisible?: boolean;
}

export default function LiveVideoThumb({ uri, style, isVisible = true }: Props) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.volume = 0;
    if (isVisible) p.play();
  });

  // Cleanup: Player pausieren wenn Komponente unmountet
  useEffect(() => {
    return () => {
      try { player.pause(); } catch {}
    };
  }, [player]);

  // isVisible-Änderungen beachten
  useEffect(() => {
    try {
      if (isVisible) player.play();
      else player.pause();
    } catch {}
  }, [isVisible, player]);

  return (
    <VideoView
      player={player}
      style={style}
      contentFit="cover"
      nativeControls={false}
    />
  );
}
