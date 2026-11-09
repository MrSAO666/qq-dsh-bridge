// Only QQ file segments with a supported image extension enter the image pipeline.
// The contents are still fetched through safeFetchBuffer and checked by image magic.
export function imageFileFromSegment(segment) {
  if (segment?.type !== 'file' || !segment.data || typeof segment.data !== 'object') return null;
  const d = segment.data;
  const name = String(d.name ?? d.file_name ?? d.filename ?? '').trim();
  if (!/\.(?:jpe?g|png|gif|webp)$/i.test(name)) return null;
  const url = typeof d.url === 'string' && /^https?:\/\//i.test(d.url) ? d.url : '';
  if (!url) return null;
  const size = Number(d.file_size ?? d.size);
  return { kind: 'image-file', url, ...(Number.isFinite(size) && size >= 0 ? { size } : {}) };
}
