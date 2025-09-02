import { pickOutputName, withinBounds } from "./helper";

// Lazy import to avoid SSR issues
let MediabunnyMod = null;
async function loadMediabunny() {
  if (!MediabunnyMod) {
    const mod = await import("mediabunny");
    MediabunnyMod = mod.default ?? mod;
  }
  return MediabunnyMod;
}

function even(n) {
  return n & ~1;
}

async function selectH264Config(width, height, fps, bitrate) {
  // Enforce even dims (some devices prefer multiples of 4/8/16, but 2 is minimum)
  const W = Math.max(2, even(width));
  const H = Math.max(2, even(height));

  if (!("VideoEncoder" in window)) return null;

  const profiles = [
    "avc1.64001F", // High@3.1
    "avc1.4D401F", // Main@3.1
    "avc1.42E01F", // Baseline@3.1
    "avc1.64001E", // High@3.0
    "avc1.4D401E", // Main@3.0
    "avc1.42E01E", // Baseline@3.0
  ];
  const formats = ["annexb", "avc"]; // parameter set formats vary by engine

  const fpsCandidates = [fps, 30, 24].filter(Boolean);
  for (const codec of profiles) {
    for (const fmt of formats) {
      for (const fr of fpsCandidates) {
        let br = Math.floor(bitrate);
        // try reducing bitrate if too high for this device
        for (let i = 0; i < 4; i++) {
          try {
            // @ts-ignore
            const res = await window.VideoEncoder.isConfigSupported({
              codec,
              width: W,
              height: H,
              framerate: Math.max(1, Math.round(fr)),
              bitrate: br,
              avc: { format: fmt },
              hardwareAcceleration: "prefer-hardware",
              latencyMode: "realtime",
            });
            if (res?.supported) {
              return {
                codecString: codec,
                width: W,
                height: H,
                fps: Math.round(fr),
                bitrate: br,
              };
            }
          } catch {
            // keep trying
          }
          br = Math.max(300_000, Math.floor(br * 0.7)); // step down bitrate
        }
      }
    }
  }
  return null;
}

/**
 * WebCodecs path: H.264 video + AAC audio → MP4 (Mediabunny)
 */
async function compressWithWebCodecs(input, opts) {
  const MB = await loadMediabunny();

  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error(
      "compressWithWebCodecs must run in the browser (no document/window)."
    );
  }

  // 1) Load source video
  const url = URL.createObjectURL(input);
  const videoEl = document.createElement("video");
  videoEl.src = url;
  videoEl.playsInline = false;
  videoEl.muted = false; // user hears nothing
  videoEl.volume = 1;
  videoEl.preload = "auto";

  await new Promise((res, rej) => {
    videoEl.onloadedmetadata = () => res();
    videoEl.onerror = () => rej(new Error("Failed to load input video"));
  });

  const bounds = withinBounds(
    videoEl.videoWidth,
    videoEl.videoHeight,
    opts.maxWidth,
    opts.maxHeight
  );
  const outW = even(bounds.w);
  const outH = even(bounds.h);

  // 2) Prepare drawing surface
  const canvas =
    "OffscreenCanvas" in window
      ? new OffscreenCanvas(outW, outH)
      : Object.assign(document.createElement("canvas"), {
          width: outW,
          height: outH,
        });

  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");

  // 3) Pick a supported H.264 config (profile/level/fps/bitrate)
  const chosen = await selectH264Config(
    outW,
    outH,
    opts.fps,
    opts.videoBitrate
  );
  if (!chosen) {
    URL.revokeObjectURL(url);
    throw new Error(
      "H.264 encoder configuration not supported on this device/browser."
    );
  }
  const { codecString, fps, bitrate } = chosen;

  // 4) Init MP4 muxer (fast start, in-memory)
  const output = new MB.Output({
    format: new MB.Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new MB.BufferTarget(),
  });

  // 5) Video from canvas using the selected codec string
  const videoSource = new MB.CanvasSource(canvas, {
    codec: "avc",
    bitrate,
    fullCodecString: codecString,
    keyFrameInterval: 2,
    latencyMode: "realtime",
  });

  output.addVideoTrack(videoSource, { frameRate: fps });

  const watchError = (name, p) =>
    p?.catch?.((e) => {
      console.error(`[Mediabunny ${name} errorPromise]`, e);
      throw e;
    });
  watchError("Output", output.errorPromise);
  watchError("CanvasSource", videoSource.errorPromise);

  // 7) Prepare DOM for playback & start playing
  const dtSec = 1 / fps;
  let frameIdx = 0;

  if (!document.body) {
    await new Promise((r) => {
      const onReady = () => {
        document.removeEventListener("DOMContentLoaded", onReady);
        r(null);
      };
      document.addEventListener("DOMContentLoaded", onReady, { once: true });
    });
  }

  const holder = document.createElement("div");
  holder.style.cssText =
    "position:fixed;left:-99999px;top:-99999px;width:1px;height:1px;overflow:hidden;opacity:0;";
  holder.appendChild(videoEl);
  document.body.appendChild(holder);

  if (videoEl.readyState < 2) {
    await new Promise((r) => {
      const oncp = () => {
        videoEl.removeEventListener("canplay", oncp);
        r(null);
      };
      videoEl.addEventListener("canplay", oncp, { once: true });
    });
  }
  // ensure context can run on user gesture
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    new AC().resume();
  } catch {}

  await videoEl.play();

  // --- AUDIO: tap pre-volume signal via WebAudio (silent to user) ---
  let audioSource = null;
  let audioTrack = null;

  // Keep these refs alive so GC doesn't kill the graph while encoding
  let acRef = null,
    srcNodeRef = null,
    gainRef = null,
    destRef = null;

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ac = new AudioContext();
    try {
      await ac.resume();
    } catch {}
    acRef = ac;

    const srcNode = ac.createMediaElementSource(videoEl);
    srcNodeRef = srcNode;

    // Branch 1: keep the graph rendering but silent to speakers
    const gain = ac.createGain();
    gain.gain.value = 0; // absolute silence
    gainRef = gain;
    srcNode.connect(gain).connect(ac.destination);

    // Branch 2: capture to a MediaStream (this is what we mux)
    const dest = ac.createMediaStreamDestination();
    destRef = dest;
    srcNode.connect(dest);

    const t = dest.stream.getAudioTracks()[0];
    if (t) {
      t.enabled = true;
      try {
        t.contentHint = "music";
      } catch {}
      audioTrack = t;

      // Provide explicit format hints from WebAudio
      const settings = t.getSettings?.() || {};
      const sampleRate = ac.sampleRate || settings.sampleRate || 48000;
      const channels = settings.channelCount || 2;

      audioSource = new MB.MediaStreamAudioTrackSource(audioTrack, {
        codec: "aac",
        bitrate: opts.audioBitrate,
        fullCodecString: "mp4a.40.2",
        sampleRate,
        numberOfChannels: channels,
      });
      output.addAudioTrack(audioSource);
      watchError("MediaStreamAudioTrackSource", audioSource.errorPromise);
    } else {
      console.warn(
        "[Audio] WebAudio destination produced no track; proceeding video-only"
      );
    }
  } catch (e) {
    console.warn(
      "Audio capture via WebAudio failed; proceeding video-only.",
      e
    );
  }

  // 7.5) Start encoders/muxer AFTER audio track is added
  await output.start();

  // rVFC + timeout fallback
  const nextFrame = () =>
    new Promise((resolve) => {
      let settled = false;
      const timeoutMs = Math.max(8, Math.round(1000 / fps) + 50);
      const t = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, timeoutMs);
      if (videoEl.requestVideoFrameCallback) {
        videoEl.requestVideoFrameCallback(() => {
          if (!settled) {
            settled = true;
            clearTimeout(t);
            resolve(null);
          }
        });
      }
    });

  // 8) Draw/encode loop
  let stallMs = 0;
  const stallLimitMs = 10000;
  let lastTime = -1;

  while (!videoEl.ended) {
    ctx.drawImage(videoEl, 0, 0, outW, outH);

    const ts = frameIdx * dtSec;
    const dur = dtSec;
    const key = frameIdx % Math.max(1, fps * 2) === 0;

    await videoSource.add(ts, dur, { keyFrame: key });
    frameIdx++;

    const ctBefore = videoEl.currentTime;
    await nextFrame();
    const ctAfter = videoEl.currentTime;

    if (ctAfter <= ctBefore + 1e-4) {
      stallMs += Math.max(8, Math.round(1000 / fps) + 50);
      if (stallMs >= stallLimitMs)
        throw new Error("Playback stalled ~10s without progress.");
    } else {
      stallMs = 0;
      lastTime = ctAfter;
    }
  }

  // 9) Finalize
  try {
    await videoEl.pause();
  } catch {}
  videoSource.close();
  if (audioSource) {
    try {
      audioTrack && audioTrack.stop && audioTrack.stop();
    } catch {}
    audioSource.close();
  }

  await output.finalize();

  const buf = output.target.buffer; // ArrayBuffer
  if (!buf || buf.byteLength === 0) {
    URL.revokeObjectURL(url);
    holder.remove();
    try {
      acRef && (await acRef.close());
    } catch {}
    throw new Error("No encoded data produced.");
  }

  const outBlob = new Blob([buf], { type: "video/mp4" });
  const outFile = new File(
    [outBlob],
    pickOutputName(input, "mp4", opts.outputName),
    { type: "video/mp4", lastModified: Date.now() }
  );

  URL.revokeObjectURL(url);
  holder.remove();
  try {
    acRef && (await acRef.close());
  } catch {}
  return outFile;
}

export default compressWithWebCodecs;
