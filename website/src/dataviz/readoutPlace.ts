/** Where a readout sits beside the pointer, kept inside its box. */
export function readoutPosition(
  x: number,
  y: number,
  box: { width: number; height: number },
  size: { width: number; height: number },
  offset = 14,
): { left: number; top: number } {
  let left = x + offset;
  let top = y + offset;
  if (left + size.width > box.width) left = Math.max(0, x - offset - size.width);
  if (top + size.height > box.height) top = Math.max(0, y - offset - size.height);
  return { left, top };
}
