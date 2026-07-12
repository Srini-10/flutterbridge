// Rendering. Nothing here knows what a pass is; it draws trees, tables and counts.

/** Whether colour is wanted: a TTY, and not explicitly disabled. `NO_COLOR` is honoured. */
const COLOUR =
  process.stdout.isTTY === true &&
  process.env['NO_COLOR'] === undefined &&
  process.env['TERM'] !== 'dumb';

const wrap = (code: string) => (text: string) =>
  COLOUR ? `\u001b[${code}m${text}\u001b[0m` : text;

export const dim = wrap('2');
export const bold = wrap('1');
export const red = wrap('31');
export const yellow = wrap('33');
export const blue = wrap('34');
export const green = wrap('32');
export const cyan = wrap('36');

/** A node in a drawable tree. */
export interface TreeNode {
  readonly label: string;
  readonly detail?: string;
  readonly children?: readonly TreeNode[];
}

/** Draws [roots] with box-drawing characters. */
export function tree(roots: readonly TreeNode[]): string {
  const lines: string[] = [];

  const draw = (node: TreeNode, prefix: string, last: boolean, root: boolean): void => {
    const branch = root ? '' : last ? '└─ ' : '├─ ';
    lines.push(`${prefix}${branch}${node.label}${node.detail === undefined ? '' : ' ' + dim(node.detail)}`);

    const children = node.children ?? [];
    const next = root ? prefix : prefix + (last ? '   ' : '│  ');
    children.forEach((child, i) => draw(child, next, i === children.length - 1, false));
  };

  roots.forEach((root, i) => draw(root, '', i === roots.length - 1, true));
  return lines.join('\n');
}

/** A two-column table, values dimmed. */
export function table(rows: readonly (readonly [string, string | number])[]): string {
  const width = Math.max(0, ...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `  ${k.padEnd(width)}  ${dim(String(v))}`).join('\n');
}

/** A bar of [value]/[max], [width] cells wide. */
export function bar(value: number, max: number, width = 24): string {
  if (max <= 0) return '';
  const filled = Math.round((value / max) * width);
  return dim('█'.repeat(filled) + '·'.repeat(Math.max(0, width - filled)));
}

/** [value] as indented JSON. */
export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
