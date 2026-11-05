import bplist from 'bplist-parser';
import plist from 'plist';

const BPLIST_MAGIC = Buffer.from('bplist00', 'latin1');

function isDict(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !Buffer.isBuffer(value) &&
    !(value instanceof Date)
  );
}

/** Parses an XML or binary (`bplist00`) property list whose root is a dictionary. */
export function parsePlist(buf: Buffer): Record<string, unknown> {
  let root: unknown;
  if (buf.subarray(0, 8).equals(BPLIST_MAGIC)) {
    root = bplist.parseBuffer(buf)[0];
  } else {
    // Strip a UTF-8 BOM; plist.parse expects text.
    const text = buf.toString('utf8').replace(/^﻿/, '');
    if (!text.trimStart().startsWith('<')) throw new Error('not a plist');
    root = plist.parse(text);
  }
  if (!isDict(root)) throw new Error('plist root is not a dictionary');
  return root;
}
