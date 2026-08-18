// Web stub — Video-Komprimierung nicht verfügbar im Browser
// On native iOS/Android, videoCompressor.native.ts wird verwendet

export const VideoCompressor = {
  compress: async (_uri: string, _options?: any, _onProgress?: any): Promise<string> => {
    throw new Error("VIDEO_COMPRESS_NOT_SUPPORTED_WEB");
  },
};
