export const formatBytes = (bytes) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0,
    v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return v.toFixed(1);
};

export const pickOutputName = (input, ext, explicit) => {
  if (explicit) return explicit;
  const base = input.name.replace(/\.[^.]+$/, "");
  return `${base}-compressed.${ext}`;
};

export const withinBounds = (srcW, srcH, maxW, maxH) => {
  const scale = Math.min(maxW / srcW, maxH / srcH, 1);
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);
  return { w, h, scale };
};
