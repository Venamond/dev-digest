/**
 * CloneFs port + Node.js adapter — filesystem surface for repo-intel walk/parse.
 */
import { readdir, readFile, realpath, stat } from 'node:fs/promises';

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
  stat(path: string): Promise<{ size: number; mtimeMs: number }>;
  /**
   * The path with every symlink resolved. Rejects when the path does not
   * exist. Containment checks that must hold PHYSICALLY (not merely
   * lexically) go through this — a directory inside a clone may be a link
   * pointing out of it.
   */
  realpath(path: string): Promise<string>;
}

export const nodeCloneFs: CloneFs = {
  readFile: (path, encoding) => readFile(path, encoding),
  readdir: (path, opts) => readdir(path, opts),
  stat: async (path) => {
    const s = await stat(path);
    return { size: s.size, mtimeMs: s.mtimeMs };
  },
  realpath: (path) => realpath(path),
};
