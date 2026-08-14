/** A request to reveal one line of one file. `nonce` re-fires the scroll
 *  when the same (path, line) is clicked twice. */
export interface DiffLineTarget {
  path: string;
  /** New-file line number (findings carry `start_line`). */
  line: number;
  nonce: number;
}
