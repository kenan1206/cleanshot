// Native implementation — uses react-native-compressor on iOS/Android
// This file is only bundled on native platforms (.native.ts suffix)

import { Video } from "react-native-compressor";

export const VideoCompressor = {
  compress: async (
    uri: string,
    options?: { compressionMethod?: string; maxSize?: number; bitrate?: number },
    onProgress?: (progress: number) => void
  ): Promise<string> => {
    return Video.compress(
      uri,
      {
        compressionMethod: options?.compressionMethod ?? "auto",
        maxSize: options?.maxSize ?? 1280,
        bitrate: options?.bitrate,
      },
      onProgress
    );
  },
};
