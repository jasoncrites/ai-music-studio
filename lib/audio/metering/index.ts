/**
 * Audio Metering Module
 *
 * Professional broadcast-grade metering for audio production:
 * - LUFS measurement (ITU-R BS.1770-4 compliant)
 * - True peak detection with oversampling
 * - Loudness range (LRA) calculation
 * - Broadcast standard compliance checking
 */

export {
  LUFSMeter,
  createLUFSWorkletProcessor,
  type LUFSMeterConfig,
  type LUFSReading,
  type LUFSHistogramBin,
  type LUFSUpdateCallback,
  type LoudnessTarget,
  type TargetComparison,
} from './lufs';

// Re-export default
export { default as LUFSMeterDefault } from './lufs';

/**
 * Loudness targets for quick reference
 * - streaming: -14 LUFS (Spotify, YouTube, Tidal)
 * - broadcast: -16 LUFS (Apple Music, podcasts)
 * - cinema: -24 LUFS (Film mixing)
 */
export const LOUDNESS_TARGETS = {
  streaming: -14,
  broadcast: -16,
  cinema: -24,
  'ebu-r128': -23,
  'atsc-a85': -24,
} as const;

/**
 * Standard broadcast loudness targets
 */
export const BROADCAST_TARGETS = {
  'ebu-r128': {
    name: 'EBU R 128',
    region: 'Europe',
    targetLUFS: -23.0,
    tolerance: 0.5,
    truePeakLimit: -1.0,
    maxLRA: 20,
  },
  'atsc-a85': {
    name: 'ATSC A/85',
    region: 'United States',
    targetLUFS: -24.0,
    tolerance: 2.0,
    truePeakLimit: -2.0,
    maxLRA: 20,
  },
  'arib-tr-b32': {
    name: 'ARIB TR-B32',
    region: 'Japan',
    targetLUFS: -24.0,
    tolerance: 1.0,
    truePeakLimit: -1.0,
    maxLRA: 15,
  },
} as const;

/**
 * Streaming platform loudness targets
 */
export const STREAMING_TARGETS = {
  spotify: {
    name: 'Spotify',
    targetLUFS: -14.0,
    truePeakLimit: -1.0,
    notes: 'Content louder than -14 LUFS will be normalized down',
  },
  'apple-music': {
    name: 'Apple Music',
    targetLUFS: -16.0,
    truePeakLimit: -1.0,
    notes: 'Sound Check normalization target',
  },
  youtube: {
    name: 'YouTube',
    targetLUFS: -14.0,
    truePeakLimit: -1.0,
    notes: 'Content louder than -14 LUFS will be normalized down',
  },
  tidal: {
    name: 'Tidal',
    targetLUFS: -14.0,
    truePeakLimit: -1.0,
    notes: 'Loudness normalization enabled by default',
  },
  amazonMusic: {
    name: 'Amazon Music',
    targetLUFS: -14.0,
    truePeakLimit: -2.0,
    notes: 'HD content may have stricter requirements',
  },
  deezer: {
    name: 'Deezer',
    targetLUFS: -15.0,
    truePeakLimit: -1.0,
    notes: 'Normalization applied to all content',
  },
  soundcloud: {
    name: 'SoundCloud',
    targetLUFS: -14.0,
    truePeakLimit: -1.0,
    notes: 'No normalization by default, Go+ has normalization',
  },
} as const;

/**
 * Metering display colors based on level
 */
export const METER_COLORS = {
  normal: '#00ff00',      // Green: Safe levels
  warning: '#ffff00',     // Yellow: Approaching limit
  danger: '#ff0000',      // Red: Clipping/over
  peak: '#ff4444',        // Bright red: Peak indicator
  target: '#00aaff',      // Blue: Target level indicator
  range: '#888888',       // Gray: LRA range
} as const;

/**
 * Get meter color based on loudness level
 */
export function getLevelColor(
  lufs: number,
  target: number = -23,
  headroom: number = 3
): string {
  if (!isFinite(lufs)) return METER_COLORS.normal;

  const diff = lufs - target;

  if (diff > headroom) {
    return METER_COLORS.danger;
  } else if (diff > 0) {
    return METER_COLORS.warning;
  }
  return METER_COLORS.normal;
}

/**
 * Get true peak color based on level
 */
export function getTruePeakColor(dBTP: number, limit: number = -1.0): string {
  if (!isFinite(dBTP)) return METER_COLORS.normal;

  if (dBTP > 0) {
    return METER_COLORS.danger;  // Clipping
  } else if (dBTP > limit) {
    return METER_COLORS.warning;  // Over limit
  }
  return METER_COLORS.normal;
}

/**
 * Format time for display (e.g., "2:35" or "1:05:23")
 */
export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
