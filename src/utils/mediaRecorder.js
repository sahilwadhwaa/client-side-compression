import { pickOutputName, withinBounds } from "./helper";

/**
 * Fallback: MediaRecorder (keeps audio by merging the original audio track)
 */
async function compressWithMediaRecorder(input, opts) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder not supported in this browser.");
  }

  const blobUrl = URL.createObjectURL(input);
  const video = document.createElement("video");
  video.src = blobUrl;
  video.playsInline = true; // no autoplay/muting
  video.muted = false; // <- DO NOT mute
  video.volume = 1;

  await new Promise((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("Failed to load input video"));
  });

  const { w: outW, h: outH } = withinBounds(
    video.videoWidth,
    video.videoHeight,
    opts.maxWidth,
    opts.maxHeight
  );

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context not available.");

  // Try to start playback; must be invoked from a user gesture or it may reject.
  try {
    await video.play();
  } catch (err) {
    // If this throws NotAllowedError, call this function within a click/tap handler.
    throw new Error(
      "Playback blocked by autoplay policy. Call from a user gesture."
    );
  }

  // ----- VIDEO: draw to canvas -----
  const fps = Math.max(1, Number(opts.fps) || 30);
  const canvasStream = canvas.captureStream(fps);
  let rafId = 0;
  const draw = () => {
    ctx.drawImage(video, 0, 0, outW, outH);
    rafId = requestAnimationFrame(draw);
  };

  // ----- AUDIO: capture via WebAudio, keep graph 'live' with a silent tap -----
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ac = null,
    dest = null,
    audioTrack = null;
  try {
    if (AudioCtx) {
      ac = new AudioCtx({ sampleRate: 48000 });
      const source = ac.createMediaElementSource(video);

      const gain = ac.createGain();
      gain.gain.value = 1;

      dest = ac.createMediaStreamDestination();
      source.connect(gain);
      gain.connect(dest); // to recording stream

      // Keep graph active but inaudible to the user
      const tap = ac.createGain();
      tap.gain.value = 0.0001; // effectively silent
      gain.connect(tap);
      tap.connect(ac.destination);

      if (ac.state !== "running") {
        try {
          await ac.resume();
        } catch {}
      }

      audioTrack = dest.stream.getAudioTracks()[0] || null;
    }
  } catch {
    // continue video-only if WebAudio fails
  }

  // ----- COMPOSITE STREAM: video(from canvas) + audio(from WebAudio) -----
  const composite = new MediaStream();
  canvasStream.getVideoTracks().forEach((t) => composite.addTrack(t));
  if (audioTrack) composite.addTrack(audioTrack);

  const supportsRecorder = (type) =>
    typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type);

  const preferMp4 = supportsRecorder("video/mp4;codecs=h264");
  const mime = preferMp4
    ? "video/mp4;codecs=h264"
    : supportsRecorder("video/webm;codecs=vp8")
    ? "video/webm;codecs=vp8"
    : "video/webm";

  const recorder = new MediaRecorder(composite, {
    mimeType: mime,
    videoBitsPerSecond: opts.videoBitrate,
    audioBitsPerSecond: audioTrack ? opts.audioBitrate : undefined,
  });

  // Persistent chunk collector
  const chunks = [];
  const onChunk = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  recorder.addEventListener("dataavailable", onChunk);

  const done = new Promise((resolve, reject) => {
    recorder.addEventListener("error", (ev) =>
      reject(ev?.error || new Error("MediaRecorder error"))
    );
    recorder.addEventListener("stop", () =>
      resolve(new Blob(chunks, { type: mime }))
    );
  });

  draw();
  recorder.start(); // no timeslice

  // Wait for first non-empty chunk (or timeout) to avoid 0-byte outputs
  await new Promise((resolve) => {
    const first = (e) => {
      if (e.data && e.data.size) {
        recorder.removeEventListener("dataavailable", first);
        resolve();
      }
    };
    recorder.addEventListener("dataavailable", first);
    setTimeout(resolve, 1000);
  });

  // End when source video ends
  await new Promise((resolve) =>
    video.addEventListener("ended", resolve, { once: true })
  );

  // Flush a final chunk, then stop
  try {
    recorder.requestData();
  } catch {}
  await new Promise((r) => setTimeout(r, 0));
  recorder.stop();
  cancelAnimationFrame(rafId);

  const blob = await done;

  // Cleanup
  try {
    composite.getTracks().forEach((t) => t.stop());
    canvasStream.getTracks().forEach((t) => t.stop());
    if (dest) dest.stream.getTracks().forEach((t) => t.stop());
    if (ac && ac.state !== "closed") await ac.close();
  } catch {}
  recorder.removeEventListener("dataavailable", onChunk);
  URL.revokeObjectURL(blobUrl);

  if (!blob || !blob.size) {
    throw new Error("MediaRecorder produced empty blob.");
  }

  const ext = preferMp4 ? "mp4" : "webm";
  return new File([blob], pickOutputName(input, ext, opts.outputName), {
    type: blob.type,
    lastModified: Date.now(),
  });
}

export default compressWithMediaRecorder;
