/**
 * Renders every configuration in the sweep to a WAV under tools/rig/out/.
 * Runs unattended. Re-running skips files that already exist, so it is safe
 * to stop and restart.
 *
 *   node tools/rig/sweep.mjs [seconds]
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out');
const seconds = Number(process.argv[2] ?? 600);

mkdirSync(outDir, { recursive: true });

const base = {
  master: 0.7,
  music: {
    enabled: true,
    level: 0.5,
    scale: 'pentatonic',
    root: 45,
    density: 5,
    tone: 1100,
    space: 0.4,
    warmth: 0.7,
  },
  noise: { enabled: true, color: 'pink', level: 0.35, tone: 6000 },
};

// The grid. Modulation rate is the axis the cited research is about, so it gets
// the most levels. Everything else is coarse.
const rates = [0, 4, 8, 12, 16, 20, 24, 32];
const depths = [0.2, 0.4, 0.6, 0.8];
const crossovers = [150, 300, 600];
const warmths = [0.3, 0.7];
const scales = ['pentatonic', 'dorian'];
const noises = [
  { enabled: false, color: 'pink', level: 0, tone: 6000 },
  { enabled: true, color: 'pink', level: 0.35, tone: 6000 },
  { enabled: true, color: 'brown', level: 0.3, tone: 2200 },
];

const configs = [];
for (const rate of rates)
  for (const depth of depths)
    for (const crossover of crossovers)
      for (const warmth of warmths)
        for (const scale of scales)
          for (const [noiseIndex, noise] of noises.entries()) {
            // Rate 0 means modulation off; depth and crossover are then meaningless,
            // so keep one representative row instead of 12 duplicates.
            if (rate === 0 && (depth !== 0.6 || crossover !== 300)) continue;
            configs.push({
              id: `r${rate}_d${depth}_x${crossover}_w${warmth}_${scale}_n${noiseIndex}`,
              settings: {
                ...base,
                modulation: { enabled: rate > 0, rate: rate || 16, depth, crossover },
                music: { ...base.music, scale, warmth },
                noise,
              },
            });
          }

console.log(`${configs.length} configurations, ${seconds}s each`);
writeFileSync(join(outDir, 'configs.json'), JSON.stringify(configs, null, 2));

const bundle = readFileSync(join(here, 'build', 'rig.js'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');
await page.addScriptTag({ content: bundle });

let done = 0;
const started = Date.now();
for (const config of configs) {
  const path = join(outDir, `${config.id}.wav`);
  done += 1;
  if (existsSync(path)) continue;
  try {
    const b64 = await page.evaluate(
      ([settings, length]) => window.steadyRender(settings, length),
      [config.settings, seconds],
    );
    writeFileSync(path, Buffer.from(b64, 'base64'));
  } catch (error) {
    console.error(`FAIL ${config.id}: ${error.message}`);
    continue;
  }
  const rate = (Date.now() - started) / 1000 / done;
  console.log(`[${done}/${configs.length}] ${config.id}  ${rate.toFixed(1)}s/render`);
}

await browser.close();
console.log('renders complete');
