// Extracts the 11-character YouTube video ID from any common URL format
// (watch?v=, youtu.be/, embed/, shorts/). Returns null if it doesn't match —
// callers should treat null as "not a valid YouTube link" and reject it,
// rather than ever passing raw user input into an iframe src.
export function extractYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}