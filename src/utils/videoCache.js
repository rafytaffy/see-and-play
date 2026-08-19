// Local Video Caching Engine using CacheStorage API

const CACHE_NAME = 'see-and-play-videos-v1';

export function isCacheSupported() {
  return typeof window !== 'undefined' && 'caches' in window;
}

export function formatVideoUrl(path) {
  if (!path) return '';
  if (path.startsWith('blob:') || path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  const base = import.meta.env.BASE_URL || '/';
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${cleanPath}`;
}

/**
 * Gets a video URL. If cached locally in CacheStorage, returns a blob URL instantly.
 * Otherwise fetches, caches, and returns a blob URL (or raw URL on fallback).
 */
export async function getCachedVideoUrl(path) {
  const fullUrl = formatVideoUrl(path);
  if (!fullUrl || !isCacheSupported()) return fullUrl;

  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(fullUrl);

    if (cachedResponse) {
      const blob = await cachedResponse.blob();
      return URL.createObjectURL(blob);
    }

    // Fetch and cache in background
    const fetchResponse = await fetch(fullUrl);
    if (fetchResponse.ok) {
      cache.put(fullUrl, fetchResponse.clone());
      const blob = await fetchResponse.blob();
      return URL.createObjectURL(blob);
    }
  } catch (err) {
    console.warn("Video cache lookup failed, using fallback URL:", err);
  }

  return fullUrl;
}

/**
 * Pre-downloads all catalog videos into local CacheStorage
 * @param {Array} videoList List of video items
 * @param {Function} onProgress Callback (cachedCount, totalCount)
 */
export async function preDownloadAllVideos(videoList = [], onProgress) {
  if (!isCacheSupported() || !videoList.length) return;

  const cache = await caches.open(CACHE_NAME);
  let cachedCount = 0;
  const total = videoList.length;

  for (let i = 0; i < total; i++) {
    const item = videoList[i];
    const fullUrl = formatVideoUrl(item.path);

    try {
      const match = await cache.match(fullUrl);
      if (!match) {
        const response = await fetch(fullUrl);
        if (response.ok) {
          await cache.put(fullUrl, response);
        }
      }
      cachedCount++;
    } catch (e) {
      console.warn(`Failed to pre-download video ${fullUrl}:`, e);
    }

    if (onProgress) {
      onProgress(cachedCount, total);
    }
  }
}

/**
 * Checks how many videos are currently cached locally
 */
export async function getCacheStats(videoList = []) {
  if (!isCacheSupported() || !videoList.length) {
    return { count: 0, total: videoList.length, isComplete: false };
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    let count = 0;
    for (const item of videoList) {
      const fullUrl = formatVideoUrl(item.path);
      const match = await cache.match(fullUrl);
      if (match) count++;
    }
    return {
      count,
      total: videoList.length,
      isComplete: count === videoList.length
    };
  } catch (e) {
    return { count: 0, total: videoList.length, isComplete: false };
  }
}
