/**
 * Mastering Module Exports
 *
 * Professional mastering chain with complete signal processing:
 * - Input gain staging
 * - Linear phase EQ (low/mid/high bands)
 * - Multi-band compression (4 bands with Linkwitz-Riley crossovers)
 * - Stereo widener (mid/side processing)
 * - Brick wall limiter with lookahead
 * - Output ceiling control
 * - Dithering (TPDF, noise shaping)
 *
 * Presets for: Streaming (Spotify/Apple), CD Master, Vinyl, Broadcast
 */

export {
  MasteringChain,
  MASTERING_PRESETS,
} from './chain';

export type {
  MasteringChainConfig,
  MultibandBandConfig,
  MasteringMeterData,
} from './chain';

// Re-export default
export { default } from './chain';
