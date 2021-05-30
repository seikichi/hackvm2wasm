import wabt from "wabt";
import { Command } from "./hackvm";
import wat from "./wat";

interface FunctionOption {
  id: number;
  nargs: number;
  thisIndex: number;
  thatIndex: number;
  labels: { [label: string]: number };
}

export async function compile(programs: Command[][]) {
  const m = wat.module([
    wat.import("js", "mem", wat.memory(2, 2)),
    wat.import("js", "sleep", "(func $sleep (param i32))"),
    ...new Array(8)
      .fill(0)
      .map((_, i) => `(global $temp${i} (mut i32) (i32.const 0))`), // FIXME
    ...programs.flatMap((p, i) => compileProgram(p, i)),
  ]);
  const w = await wabt();
  const module = w.parseWat("HACKVM", m, { mutable_globals: true });
  return new WebAssembly.Module(module.toBinary({}).buffer);
}

export async function compileToBinary(
  programs: Command[][]
): Promise<Uint8Array> {
  const m = wat.module([
    wat.import("js", "mem", wat.memory(2, 2)),
    wat.import("js", "sleep", "(func $sleep (param i32))"),
    ...new Array(8)
      .fill(0)
      .map((_, i) => `(global $temp${i} (mut i32) (i32.const 0))`), // FIXME
    ...programs.flatMap((p, i) => compileProgram(p, i)),
  ]);
  const w = await wabt();
  const module = w.parseWat("HACKVM", m, { mutable_globals: true });
  return module.toBinary({}).buffer;
}

function compileProgram(program: Command[], id: number): string[] {
  const result: string[] = [];

  const statics = new Set<number>();
  for (const op of program) {
    if ((op.type === "push" || op.type === "pop") && op.args[0] == "static") {
      statics.add(op.args[1]);
    }
  }

  // FIXME
  statics.forEach((s) =>
    result.push(`(global $static_${id}_${s} (mut i32) (i32.const 0))`)
  );

  // Split by functions
  const functions: Command[][] = program.reduce((fs, c) => {
    if (c.type === "function") {
      fs.push([c]);
    } else {
      fs[fs.length - 1].push(c);
    }
    return fs;
  }, [] as Command[][]);

  // Compile functions
  for (const fn of functions) {
    result.push(compileFunction(fn, id));
  }

  return result;
}

function compileFunction(fn: Command[], id: number): string {
  if (fn[0].type !== "function") {
    throw "Invalid Argument";
  }

  let nargs = 0;
  for (const c of fn) {
    if ((c.type === "push" || c.type === "pop") && c.args[0] === "argument") {
      nargs = Math.max(nargs, c.args[1] + 1);
    }
  }

  const name = fn[0].args[0];
  const nlocals = fn[0].args[1] + 2; // +2 for switch variable and temp variable
  const thisIndex = nargs + nlocals;
  const thatIndex = nargs + nlocals + 1;

  // Split by blocks
  const commandBlocks: Command[][] = fn
    .slice(1)
    .reduce(
      (bs, c) => {
        if (c.type === "label") {
          bs.push([c]);
        } else if (c.type === "goto" || c.type === "if-goto") {
          bs[bs.length - 1].push(c);
          bs.push([]);
        } else {
          bs[bs.length - 1].push(c);
        }
        return bs;
      },
      [[]] as Command[][]
    )
    .filter((bs) => bs.length > 0);

  const labels: { [label: string]: number } = {};
  for (let i = 0; i < commandBlocks.length; i++) {
    const c = commandBlocks[i][0];
    if (c.type === "label") {
      labels[c.args[0]] = i;
    }
  }

  const options = { nargs, thisIndex, thatIndex, id, labels };

  const blocks: string[][] = [];
  for (let i = 0; i < commandBlocks.length; i++) {
    blocks.push(compileBlock(commandBlocks[i], options));
  }

  const labelLocal = thisIndex - 2;
  const nblocks = blocks.length;

  let b = wat.block([
    wat.local.get(labelLocal),
    wat.br_table(new Array(nblocks + 2).fill(0).map((_, i) => i)),
  ]);

  for (let i = 0; i < blocks.length; i++) {
    b = wat.block([b, ...blocks[i]]);
  }

  const body = wat.loop("$LOOP", [b]);

  return wat.func(`$${name}`, [
    wat.export(name),
    ...new Array(nargs).fill(wat.param("i32")),
    wat.result("i32"),
    ...new Array(nlocals + 2).fill(wat.local("i32")),

    body,
    wat.i32.const(0), // dummy
  ]);
}

function compileBlock(
  b: Command[],
  { id, nargs, thisIndex, thatIndex, labels }: FunctionOption
): string[] {
  const labelLocal = thisIndex - 2;
  const tempLocal = thisIndex - 1; // FIXME;
  const results: string[] = [];
  for (const c of b) {
    switch (c.type) {
      case "label":
        break;
      case "goto": {
        const index = labels[c.args[0]]!;
        results.push(wat.i32.const(index));
        results.push(wat.local.set(labelLocal));
        results.push(wat.br("$LOOP"));
        break;
      }
      case "if-goto": {
        const index = labels[c.args[0]]!;
        results.push(
          wat.if([
            wat.i32.const(index),
            wat.local.set(labelLocal),
            wat.br("$LOOP"),
          ])
        );
        break;
      }
      case "push": {
        switch (c.args[0]) {
          case "constant":
            results.push(wat.i32.const(c.args[1]));
            break;
          case "argument":
            results.push(wat.local.get(c.args[1]));
            break;
          case "local":
            results.push(wat.local.get(nargs + c.args[1]));
            break;
          case "pointer":
            const index = c.args[1] == 0 ? thisIndex : thatIndex;
            results.push(wat.local.get(index));
            break;
          case "this":
            results.push(wat.i32.const(2));
            results.push(wat.local.get(thisIndex));
            results.push(wat.i32.mul());
            results.push(wat.i32.load16_s(2 * c.args[1]));
            break;
          case "that":
            results.push(wat.i32.const(2));
            results.push(wat.local.get(thatIndex));
            results.push(wat.i32.mul());
            results.push(wat.i32.load16_s(2 * c.args[1]));
            break;
          case "temp":
            results.push(wat.global.get(`$temp${c.args[1]}`));
            break;
          case "static":
            results.push(wat.global.get(`$static_${id}_${c.args[1]}`));
            break;
          default:
            const _: never = c.args[0];
            throw `Invalid Argument ${JSON.stringify(c)}`;
        }
        break;
      }
      case "pop": {
        switch (c.args[0]) {
          case "argument":
            results.push(wat.local.set(c.args[1]));
            break;
          case "local":
            results.push(wat.local.set(nargs + c.args[1]));
            break;
          case "pointer":
            const index = c.args[1] == 0 ? thisIndex : thatIndex;
            results.push(wat.local.set(index));
            break;
          case "this":
            results.push(wat.local.set(tempLocal));
            results.push(wat.i32.const(2));
            results.push(wat.local.get(thisIndex));
            results.push(wat.i32.mul());
            results.push(wat.local.get(tempLocal));
            results.push(wat.i32.store16(2 * c.args[1]));
            break;
          case "that":
            results.push(wat.local.set(tempLocal));
            results.push(wat.i32.const(2));
            results.push(wat.local.get(thatIndex));
            results.push(wat.i32.mul());
            results.push(wat.local.get(tempLocal));
            results.push(wat.i32.store16(2 * c.args[1]));
            break;
          case "temp":
            results.push(wat.global.set(`$temp${c.args[1]}`));
            break;
          case "static":
            results.push(wat.global.set(`$static_${id}_${c.args[1]}`));
            break;
          case "constant":
            throw `Invalid Argument ${JSON.stringify(c)}`;
          default:
            const _: never = c.args[0];
            throw `Invalid Argument ${JSON.stringify(c)}`;
        }
        break;
      }
      case "neg":
        results.push(wat.i32.const(-1));
        results.push(wat.i32.mul());
        break;
      case "not":
        results.push(wat.i32.const(-1));
        results.push(wat.i32.xor());
        break;
      case "add":
      case "sub":
      case "eq":
      case "gt":
      case "lt":
      case "and":
      case "or": {
        const operations = {
          add: wat.i32.add,
          sub: wat.i32.sub,
          eq: wat.i32.eq,
          gt: wat.i32.gt_s,
          lt: wat.i32.lt_s,
          and: wat.i32.and,
          or: wat.i32.or,
        };
        results.push(operations[c.type]());

        if (c.type === "eq" || c.type === "lt" || c.type === "gt") {
          results.push(wat.local.set(tempLocal));
          results.push(wat.i32.const(-1));
          results.push(wat.i32.const(0));
          results.push(wat.local.get(tempLocal));
          results.push(wat.select());
        }
        break;
      }
      case "return":
        results.push(wat.return());
        break;
      case "call":
        const [name, _nargs] = c.args;
        results.push(wat.call(`$${name}`));
        break;
      case "function":
        throw `Invali Command: ${JSON.stringify(c)}`;
      default:
        const _: never = c;
        throw `Unimplemented Command: ${JSON.stringify(c)}`;
    }
  }

  return results;
}
