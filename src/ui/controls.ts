/** Small builders for the advanced panel. Nothing clever, just less repetition. */

export interface SliderSpec {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Turns the raw number into what the user reads, for example "6.0 kHz". */
  format?: (value: number) => string;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) node.append(child);
  return node;
}

export function slider(spec: SliderSpec, onChange: (value: number) => void): HTMLElement {
  const wrap = el('label', { class: 'field', for: spec.id });
  const readout = el('span', { class: 'readout' }, [format(spec, spec.value)]);
  const caption = el('span', {}, [`${spec.label} `]);
  caption.append(readout);

  const input = el('input', {
    id: spec.id,
    type: 'range',
    min: String(spec.min),
    max: String(spec.max),
    step: String(spec.step),
    value: String(spec.value),
  });

  input.addEventListener('input', () => {
    const value = Number(input.value);
    readout.textContent = format(spec, value);
    onChange(value);
  });

  wrap.append(caption, input);
  return wrap;
}

export function toggle(
  id: string,
  label: string,
  checked: boolean,
  onChange: (value: boolean) => void,
): HTMLElement {
  const wrap = el('label', { class: 'toggle', for: id });
  const input = el('input', { id, type: 'checkbox' });
  (input as HTMLInputElement).checked = checked;
  input.addEventListener('change', () => onChange((input as HTMLInputElement).checked));
  wrap.append(input, label);
  return wrap;
}

export function select<T extends string>(
  id: string,
  label: string,
  options: { value: T; label: string }[],
  value: T,
  onChange: (value: T) => void,
): HTMLElement {
  const wrap = el('label', { class: 'field', for: id });
  const node = el('select', { id });
  for (const option of options) {
    const opt = el('option', { value: option.value }, [option.label]);
    node.append(opt);
  }
  (node as HTMLSelectElement).value = value;
  node.addEventListener('change', () => onChange((node as HTMLSelectElement).value as T));
  wrap.append(el('span', {}, [label]), node);
  return wrap;
}

export function group(legend: string, children: (Node | string)[]): HTMLElement {
  const fieldset = el('fieldset', { class: 'group' });
  fieldset.append(el('legend', { class: 'sr-only' }, [legend]));
  for (const child of children) fieldset.append(child);
  return fieldset;
}

function format(spec: SliderSpec, value: number): string {
  return spec.format ? spec.format(value) : String(value);
}

export const fmt = {
  hz: (v: number) => `${Math.round(v)} Hz`,
  khz: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`),
  percent: (v: number) => `${Math.round(v * 100)}%`,
  seconds: (v: number) => `${v.toFixed(0)} s`,
  beat: (v: number) => `${v.toFixed(1)} Hz`,
};
