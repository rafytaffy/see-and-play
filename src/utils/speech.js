// Native Web Speech API Utility for Voice Activation & Search

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function isSpeechSupported() {
  return !!SpeechRecognition;
}

/**
  * Start continuous or single voice recognition listener
  * @param {Object} options
  * @param {Function} options.onResult - Callback receiving (transcript, cleanKeyword)
  * @param {Function} options.onError - Callback receiving error message
  * @param {Function} options.onEnd - Callback when recognition ends
  * @param {boolean} options.continuous - Whether to auto-restart listening
  */
export function startVoiceListener({ onResult, onError, onEnd, continuous = true }) {
  if (!isSpeechSupported()) {
    if (onError) onError('Speech recognition is not supported in this browser.');
    return null;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const lastIndex = event.results.length - 1;
      const transcript = event.results[lastIndex][0].transcript.toLowerCase().trim();
      console.log('🎙️ Voice Listener heard:', transcript);

      if (onResult) {
        onResult(transcript);
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      if (onError) onError(event.error);
    };

    recognition.onend = () => {
      if (onEnd) onEnd();
    };

    recognition.start();

    return {
      stop: () => {
        try {
          recognition.stop();
        } catch (e) {
          // Ignore if already stopped
        }
      }
    };
  } catch (err) {
    console.error('Failed to initialize speech recognition:', err);
    if (onError) onError(err.message);
    return null;
  }
}

/**
 * Match a spoken string against a list of catalog items (e.g. videos)
 * @param {string} transcript 
 * @param {Array} catalog 
 * @returns {Object|null} Matching video item or null
 */
export function matchSpeechToVideo(transcript, catalog) {
  if (!transcript || !catalog || catalog.length === 0) return null;

  const clean = transcript.toLowerCase().trim();

  // 1. Direct label or defaultName match
  for (const item of catalog) {
    const defaultName = (item.defaultName || '').toLowerCase();
    const labelClean = (item.label || '').toLowerCase().replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim(); // strip emojis
    
    if (defaultName && clean.includes(defaultName)) {
      return item;
    }
    if (labelClean && clean.includes(labelClean)) {
      return item;
    }
  }

  // 2. Token / word boundary fuzzy match
  const words = clean.split(/\s+/);
  for (const word of words) {
    if (word.length < 3) continue; // skip tiny words like "a", "is", "in"
    for (const item of catalog) {
      const defaultName = (item.defaultName || '').toLowerCase();
      const itemId = (item.id || '').toLowerCase();
      
      if (defaultName.includes(word) || itemId.includes(word)) {
        return item;
      }
    }
  }

  return null;
}
