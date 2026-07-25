import type { MessageParams } from './context';

const PLACEHOLDER = /\{(\w+)\}/g;

/** Replaces every `{name}` placeholder with `params.name`, leaving unknown ones intact. */
export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
