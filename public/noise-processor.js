/**
 * Noise generator that runs on the audio rendering thread.
 *
 * Everything here is sample by sample arithmetic with no allocation inside the
 * render loop. That is the point: the main thread can be busy laying out the
 * page and the noise still comes out clean, because this code is not on it.
 *
 * Three colors:
 *   white  flat spectrum, raw uniform samples
 *   pink   about -3 dB per octave, Paul Kellet's filter approximation
 *   brown  about -6 dB per octave, a leaky integrator over white noise
 *
 * Message protocol: postMessage({ color }) to switch color. Gain is applied
 * outside this processor by a normal GainNode, so the processor never has to
 * ramp anything.
 */

const KELLET_STATE_SIZE = 7;

class NoiseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const initial =
      (options && options.processorOptions && options.processorOptions.color) || 'pink';
    this.color = initial;

    // Paul Kellet pink filter state.
    this.b = new Float32Array(KELLET_STATE_SIZE);
    // Leaky integrator state for brown noise.
    this.brown = 0;

    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.color === 'white' || data.color === 'pink' || data.color === 'brown') {
        this.color = data.color;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const first = output[0];
    const frames = first.length;
    const b = this.b;

    for (let i = 0; i < frames; i += 1) {
      const white = Math.random() * 2 - 1;
      let sample;

      if (this.color === 'white') {
        sample = white * 0.35;
      } else if (this.color === 'pink') {
        // Six one pole filters summed, plus a direct term. The coefficients are
        // Kellet's; they hold roughly -3 dB per octave from about 20 Hz upward.
        b[0] = 0.99886 * b[0] + white * 0.0555179;
        b[1] = 0.99332 * b[1] + white * 0.0750759;
        b[2] = 0.969 * b[2] + white * 0.153852;
        b[3] = 0.8665 * b[3] + white * 0.3104856;
        b[4] = 0.55 * b[4] + white * 0.5329522;
        b[5] = -0.7616 * b[5] - white * 0.016898;
        const pink = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + white * 0.5362;
        b[6] = white * 0.115926;
        sample = pink * 0.09;
      } else {
        // Leaky integrator. The leak keeps the running sum from wandering off
        // into DC, which a pure integrator would do within seconds.
        this.brown = (this.brown + white * 0.02) / 1.02;
        sample = this.brown * 3.0;
      }

      // Cheap guard against any state blowing up; nothing should reach this.
      if (sample > 1) sample = 1;
      else if (sample < -1) sample = -1;

      first[i] = sample;
    }

    // Same signal to every channel. Stereo width comes from later stages, not
    // from decorrelated noise, which would make the field feel wider and so
    // more interesting. Interesting is not what this is for.
    for (let c = 1; c < output.length; c += 1) {
      output[c].set(first);
    }

    return true;
  }
}

registerProcessor('noise-processor', NoiseProcessor);
