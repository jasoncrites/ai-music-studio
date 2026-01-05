/**
 * Reverb Effects Module
 *
 * Professional reverb effects including:
 * - ConvolverReverb: Convolution-based reverb with synthetic IR generation
 *   and famous space presets (Abbey Road, Muscle Shoals, plates, halls)
 */

export {
  ConvolverReverb,
  CONVOLVER_PRESETS,
} from './convolver';

export type {
  ConvolverReverbConfig,
  SyntheticIRType,
} from './convolver';
