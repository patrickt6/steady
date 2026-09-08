/**
 * A reverb impulse response generated at runtime.
 *
 * Shipping a .wav impulse would mean an audio asset, a download, and a cache
 * entry. Exponentially decaying noise is a passable small room and costs
 * nothing, so the repo stays free of binary assets.
 */

export interface ImpulseOptions {
  seconds: number;
  /** Higher decays faster. 2 is a small room, 5 is a very short tail. */
  decay: number;
}

export function createImpulseResponse(
  context: BaseAudioContext,
  { seconds, decay }: ImpulseOptions,
): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = context.createBuffer(2, length, rate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buffer;
}

export function createReverb(context: BaseAudioContext, options: ImpulseOptions): ConvolverNode {
  const convolver = context.createConvolver();
  convolver.normalize = true;
  convolver.buffer = createImpulseResponse(context, options);
  return convolver;
}
