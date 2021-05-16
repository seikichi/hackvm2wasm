import binaryen, { ExpressionRef } from "binaryen";

const SEGMENTS = [
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

function parseLine(raw: string): Command | null {
  const line = raw.replace(/\/\/.*$/, "").trim();
  if (line === "") {
    return null;
  }

  // TODO: remove any, redundant code...
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

const commands = [
  parseLine("function answer 0")!,
  parseLine("push constant 1")!,
  parseLine("push constant 41")!,
  parseLine("add")!,
  parseLine("return")!,
];

for (const c of commands) {
  console.log(c);
}

const { createType, i32 } = binaryen;
const m = new binaryen.Module();

function compile(fn: Command[]) {
  if (fn[0].type !== "function") {
    throw "Invalid Argument";
  }

  const [name, locals] = fn[0].args;
  const params = createType([]); // FIXME
  const results = i32;
  const vars = new Array(locals).fill(i32);

  const exprs: ExpressionRef[] = [];

  for (const c of fn.slice(1)) {
    switch (c.type) {
      case "push":
        if (c.args[0] !== "constant") {
          throw `Unimplemented Command: ${JSON.stringify(c)}`;
        }
        exprs.push(m.i32.const(c.args[1]));
        continue;
      case "add":
        if (exprs.length < 2) {
          throw `Invalid Command: ${JSON.stringify(c)}`;
        }
        const lhs = exprs.pop()!;
        const rhs = exprs.pop()!;
        exprs.push(m.i32.add(lhs, rhs));
        continue;
      case "return":
        if (exprs.length < 1) {
          throw `Invalid Command: ${JSON.stringify(c)}`;
        }
        const ret = exprs.pop();
        exprs.push(m.return(ret));
        continue;
      default:
        throw `Unimplemented Command: ${JSON.stringify(c)}`;
    }
  }

  const body = exprs.length === 1 ? exprs[0] : m.block("block", exprs);
  m.addFunction(name, params, results, vars, body);
  m.addFunctionExport(name, name);
}

compile(commands);
m.optimize();

if (!m.validate()) {
  throw new Error("validation error");
}

const text = m.emitText();
console.log(text);

const wasm = m.emitBinary();
const compiled = new WebAssembly.Module(wasm);
const instance = new WebAssembly.Instance(compiled, {});

const e = instance.exports as any;
console.log(e.answer());
