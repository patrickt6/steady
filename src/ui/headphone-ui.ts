import {
  PASS_THRESHOLD,
  TRIAL_COUNT,
  makeTrials,
  playTrial,
  scoreTrials,
  verdict,
  type Trial,
} from '../audio/headphone-check';
import { el } from './controls';

/**
 * The headphone check, as a panel.
 *
 * It is deliberately behind a disclosure and never blocks the play button.
 * Someone who wants sound now should get sound now; the check is for people who
 * want to know whether the stereo work is reaching them.
 */
export function mountHeadphoneCheck(
  container: HTMLElement,
  getContext: () => Promise<AudioContext>,
): void {
  let trials: Trial[] = [];
  let answers: number[] = [];
  let index = 0;
  let busy = false;

  render();

  function render(): void {
    container.replaceChildren();

    if (trials.length === 0) {
      const start = el('button', { type: 'button', class: 'secondary' }, ['Start the check']);
      start.addEventListener('click', () => {
        trials = makeTrials(Math.random);
        answers = [];
        index = 0;
        void nextTrial();
      });
      container.append(start);
      return;
    }

    if (index >= trials.length) {
      const correct = scoreTrials(trials, answers);
      const result = verdict(correct);
      container.append(
        el('p', { class: 'result', role: 'status' }, [
          result === 'headphones'
            ? `${correct} of ${TRIAL_COUNT} correct. That is consistent with headphones.`
            : `${correct} of ${TRIAL_COUNT} correct. That usually means speakers, or headphones worn the wrong way round. ${PASS_THRESHOLD} of ${TRIAL_COUNT} is a pass.`,
        ]),
        el('p', { class: 'hint' }, [
          'The check is a rough screen, not a verdict on your hearing. Quiet rooms and careful ' +
            'listening both help.',
        ]),
      );
      const again = el('button', { type: 'button', class: 'secondary' }, ['Run it again']);
      again.addEventListener('click', () => {
        trials = [];
        render();
      });
      container.append(again);
      return;
    }

    const progress = el('p', { class: 'hint' }, [`Trial ${index + 1} of ${trials.length}`]);
    const prompt = el('p', {}, ['Which tone was quietest?']);

    const choices = el('div', {
      class: 'bands',
      role: 'group',
      'aria-label': 'Which was quietest',
    });
    for (let i = 0; i < 3; i += 1) {
      const button = el('button', { type: 'button', class: 'band' }, [`Tone ${i + 1}`]);
      if (busy) button.setAttribute('disabled', 'true');
      button.addEventListener('click', () => {
        answers.push(i);
        index += 1;
        void nextTrial();
      });
      choices.append(button);
    }

    const replay = el('button', { type: 'button', class: 'secondary' }, ['Play again']);
    if (busy) replay.setAttribute('disabled', 'true');
    replay.addEventListener('click', () => void playCurrent());

    container.append(progress, prompt, choices, replay);
  }

  async function nextTrial(): Promise<void> {
    render();
    if (index < trials.length) await playCurrent();
    else render();
  }

  async function playCurrent(): Promise<void> {
    if (busy) return;
    busy = true;
    render();
    try {
      const context = await getContext();
      await playTrial(context, trials[index]);
    } catch {
      // No audio available. The buttons still work; the result will just be
      // meaningless, which the user can see for themselves.
    }
    busy = false;
    render();
  }
}
