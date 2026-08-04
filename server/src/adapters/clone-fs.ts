/**
 * CloneFs port + Node.js adapter — filesystem surface for repo-intel walk/parse.
 */
import { readdir, readFile, stat } from 'node:fs/promises';

/** Minimal dirent shape returned by CloneFs.readdir({ withFileTypes: true }). */
export interface CloneDirent {
  name: string;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export interface CloneFs {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  readdir(path: string, opts: { withFileTypes: true }): Promise<CloneDirent[]>;
  stat(path: string): Promise<{ size: number }>;
}

export const nodeCloneFs: CloneFs = {
  readFile: (path, encoding) => readFile(path, encoding),
  readdir: (path, opts) => readdir(path, opts),
  stat: async (path) => {
    const s = await stat(path);
    return { size: s.size };
  },
};
