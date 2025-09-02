import compressWithMediaRecorder from "./mediaRecorder";
import compressWithWebCodecs from "./webCodecs";

const hasWebCodecs =
  typeof window !== "undefined" &&
  "VideoEncoder" in window &&
  "AudioEncoder" in window;

export const compressVideo = async (file, opts, setUploading) => {
  setUploading(true);

  if (!file) throw new Error("No input file");

  if (hasWebCodecs) {
    try {
      return await compressWithWebCodecs(file, opts); // H.264 + AAC → MP4
    } catch (e) {
      console.warn("[compressVideo] WebCodecs failed; falling back:", e);
    }
  }

  try {
    // Fallback that preserves audio
    return await compressWithMediaRecorder(file, opts);
  } catch (e) {
    console.warn(
      "[compressVideo] MediaRecorder failed; falling back to ffmpeg:",
      e
    );
    return input; // If all fail, pass file as-is
  }
};
