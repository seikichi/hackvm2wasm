export const SEGMENTS = [
  "argument",
  "local",
  "static",
  "constant",
  "this",
  "that",
  "pointer",
  "temp",
] as const;

export type SEGMENT_TYPE = typeof SEGMENTS[number];

export type Command =
  | { type: "add" }
  | { type: "sub" }
  | { type: "neg" }
  | { type: "eq" }
  | { type: "gt" }
  | { type: "lt" }
  | { type: "and" }
  | { type: "or" }
  | { type: "not" }
  | { type: "push"; args: [SEGMENT_TYPE, number] }
  | { type: "pop"; args: [SEGMENT_TYPE, number] }
  | { type: "label"; args: [string] }
  | { type: "goto"; args: [string] }
  | { type: "if-goto"; args: [string] }
  | { type: "function"; args: [string, number] }
  | { type: "return" }
  | { type: "call"; args: [string, number] };

export function parseLine(raw: string): Command | null {
  const line = raw.replace(/\/\/.*$/, "").trim();
  if (line === "") {
    return null;
  }

  const [type, ...args] = line.split(/\s+/);
  if (args.length === 0) {
    return { type } as Command;
  }
  if (args.length === 1) {
    return { type, args } as Command;
  }
  if (args.length === 2) {
    return { type, args: [args[0], parseInt(args[1], 10)] } as Command;
  }
  throw `Unknown Command: ${raw}`;
}

export function parse(raw: string): Command[] {
  return raw
    .split(/\r?\n/)
    .map(parseLine)
    .filter((c): c is Command => c !== null);
}
