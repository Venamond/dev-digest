/**
 * CodeAnalysis port + ast-grep/extract adapter for repo-intel.
 */
import {
  langForFile,
  parseImports,
  parseInvocationHeads,
  parseReferences,
  parseSymbols,
} from './astgrep/index.js';
import { extractCrons, extractEndpoints } from './codeindex/extract.js';

export interface ParsedSymbol {
  name: string;
  kind: string;
  line: number;
  endLine: number;
  exported: boolean;
  signature: string | null;
}

export interface ParsedReference {
  toSymbol: string;
  line: number;
}

export interface ParsedImport {
  name: string;
  source: string;
  isType: boolean;
}

export interface ParsedInvocationHead {
  name: string;
  line: number;
  kind: 'call' | 'new' | 'jsx';
}

/**
 * Ast-grep parse + regex facts. `langForFile` stays truthy/null like the
 * adapter (Lang enum is not leaked into application types).
 */
export interface CodeAnalysis {
  langForFile(file: string): unknown | null;
  parseSymbols(file: string, source: string): ParsedSymbol[];
  parseReferences(file: string, source: string): ParsedReference[];
  parseImports(file: string, source: string): ParsedImport[];
  parseInvocationHeads(file: string, source: string): ParsedInvocationHead[];
  extractEndpoints(source: string): string[];
  extractCrons(source: string): string[];
}

export const astgrepCodeAnalysis: CodeAnalysis = {
  langForFile,
  parseSymbols,
  parseReferences,
  parseImports,
  parseInvocationHeads,
  extractEndpoints,
  extractCrons,
};
