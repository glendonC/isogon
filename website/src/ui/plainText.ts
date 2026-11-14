/**
 * Strings that arrive from the backend or from generated artifacts can carry separator glyphs the
 * interface does not use (middle dots between fields, long dashes). Displayed text goes through here:
 * a dot between fields becomes a comma, a long dash becomes a comma, a range dash becomes a hyphen.
 * Code points are built at runtime so this file itself stays free of those glyphs.
 */
const DOT = String.fromCharCode(0x00b7);
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);

export function plainText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .split(` ${DOT} `)
    .join(', ')
    .split(DOT)
    .join(', ')
    .split(` ${EM} `)
    .join(', ')
    .split(EM)
    .join(', ')
    .split(EN)
    .join('-');
}
