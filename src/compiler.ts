import binaryen, {
  ExpressionRef,
  Module,
  createType,
  i32,
  Features,
} from "binaryen";
import { Command } from "./hackvm";

export function compile(programs: Command[][]) {
  const m = new Module();
  m.setFeatures(Features.MVP | Features.MutableGlobals);

  // Setup Memory
  m.setMemory(2, 2);
  m.addMemoryImport("0", "js", "mem");

  programs.forEach((p, i) => {
    compileProgram(m, p, i);
  });

  return m;
}

export function compileProgram(m: Module, program: Command[], id: number) {
  // Handle Statics
  const statics = new Set<number>();
  for (const op of program) {
    if ((op.type === "push" || op.type === "pop") && op.args[0] == "static") {
      statics.add(op.args[1]);
    }
  }
  statics.forEach((s) =>
    m.addGlobal(`static.${id}.${s}`, i32, true, m.i32.const(0))
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
    compileFunction(m, fn, id);
  }
}

function compileFunction(m: Module, fn: Command[], id: number) {
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
  const nlocals = fn[0].args[1] + 1; // +1 for Relooper variable
  const params = createType(new Array(nargs).fill(i32));
  const results = i32;
  const vars = new Array(nlocals + 2).fill(i32);
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

  const options = { nargs, thisIndex, thatIndex, id };

  const blocks: Block[] = [];
  for (const b of commandBlocks) {
    blocks.push(compileBlock(m, b, options));
  }

  const r = new binaryen.Relooper(m);
  const blockRefs: binaryen.RelooperBlockRef[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i].refs.length === 0 ? 0 : m.block("", blocks[i].refs);
    blockRefs.push(r.addBlock(b));
  }

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.branch) {
      const { label, condition } = b.branch;
      const next = blocks.findIndex((b) => b.label === label);
      if (next === -1) {
        throw `label ${label} not found`;
      }
      r.addBranch(blockRefs[i], blockRefs[next], condition, 0);
    }
    if (b.branch && b.branch.condition === 0) {
      continue;
    }
    if (i + 1 < blocks.length) {
      r.addBranch(blockRefs[i], blockRefs[i + 1], 0, 0);
    }
  }

  const body = r.renderAndDispose(blockRefs[0], nargs + nlocals - 1);

  m.addFunction(name, params, results, vars, body);
  m.addFunctionExport(name, name);
}

interface FunctionOption {
  id: number;
  nargs: number;
  thisIndex: number;
  thatIndex: number;
}

interface Block {
  label?: string;
  refs: ExpressionRef[];
  branch?: {
    label: string;
    condition: ExpressionRef;
  };
}

function compileBlock(
  m: Module,
  b: Command[],
  { id, nargs, thisIndex, thatIndex }: FunctionOption
): Block {
  let label: string | undefined;
  const exprs: ExpressionRef[] = [];
  let branch: Block["branch"] | undefined;

  for (const c of b) {
    switch (c.type) {
      case "label":
        if (label) {
          throw `Invalid Argument ${JSON.stringify(c)}`;
        }
        label = c.args[0];
        break;
      case "goto":
        if (branch) {
          throw `Invalid Argument ${JSON.stringify(c)}`;
        }
        branch = { label: c.args[0], condition: 0 };
        break;
      case "if-goto": {
        if (branch || exprs.length < 1) {
          throw `Invalid Argument ${JSON.stringify(c)}`;
        }
        const e = exprs.pop()!;
        const condition = m.i32.ne(e, m.i32.const(0));
        branch = { label: c.args[0], condition };
        break;
      }
      case "push": {
        switch (c.args[0]) {
          case "constant":
            exprs.push(m.i32.const(c.args[1]));
            break;
          case "argument":
            exprs.push(m.local.get(c.args[1], i32));
            break;
          case "local":
            exprs.push(m.local.get(c.args[1] + nargs, i32));
            break;
          case "pointer":
            const index = c.args[1] == 0 ? thisIndex : thatIndex;
            exprs.push(m.local.get(index, i32));
            break;
          case "this":
            exprs.push(
              m.i32.load(
                4 * c.args[1],
                0,
                m.i32.mul(m.i32.const(4), m.local.get(thisIndex, i32))
              )
            );
            break;
          case "that":
            exprs.push(
              m.i32.load(
                4 * c.args[1],
                0,
                m.i32.mul(m.i32.const(4), m.local.get(thatIndex, i32))
              )
            );
            break;
          case "temp":
            exprs.push(m.i32.load(4 * (5 + c.args[1]), 0, m.i32.const(0)));
            break;
          case "static":
            exprs.push(m.global.get(`static.${id}.${c.args[1]}`, i32));
            break;
          default:
            const _: never = c.args[0];
            throw `Invalid Argument ${JSON.stringify(c)}`;
        }
        break;
      }
      case "pop": {
        if (exprs.length < 1) {
          throw `Invalid Command: ${JSON.stringify(c)}`;
        }
        const e = exprs.pop()!;

        switch (c.args[0]) {
          case "argument":
            exprs.push(m.local.set(c.args[1], e));
            break;
          case "local":
            exprs.push(m.local.set(c.args[1] + nargs, e));
            break;
          case "pointer":
            const index = c.args[1] == 0 ? thisIndex : thatIndex;
            exprs.push(m.local.set(index, e));
            break;
          case "this":
            exprs.push(
              m.i32.store(
                4 * c.args[1],
                0,
                m.i32.mul(m.i32.const(4), m.local.get(thisIndex, i32)),
                e
              )
            );
            break;
          case "that":
            exprs.push(
              m.i32.store(
                4 * c.args[1],
                0,
                m.i32.mul(m.i32.const(4), m.local.get(thatIndex, i32)),
                e
              )
            );
            break;
          case "temp":
            exprs.push(m.i32.store(4 * (5 + c.args[1]), 0, m.i32.const(0), e));
            break;
          case "static":
            exprs.push(m.global.set(`static.${id}.${c.args[1]}`, e));
            break;
          case "constant":
            throw `Invalid Argument ${JSON.stringify(c)}`;
          default:
            const _: never = c.args[0];
            throw `Invalid Argument ${JSON.stringify(c)}`;
        }
        break;
      }
      case "neg": {
        if (exprs.length < 1) {
          throw `Invalid Command: ${JSON.stringify(c)}`;
        }
        const ret = exprs.pop()!;
        exprs.push(m.i32.sub(m.i32.const(0), ret));
        break;
      }
      case "not": {
        if (exprs.length < 1) {
          throw `Invalid Command: ${JSON.stringify(c)}`;
        }
        const ret = exprs.pop()!;
        exprs.push(m.i32.xor(ret, m.i32.const(-1)));
        break;
      }
      case "add":
      case "sub":
      case "eq":
      case "gt":
      case "lt":
      case "and":
      case "or": {
        if (exprs.length < 2) {
          throw `Invalid Command: ${JSON.stringify(c)}`;
        }
        const operations = {
          add: m.i32.add,
          sub: m.i32.sub,
          eq: m.i32.eq,
          gt: m.i32.gt_s,
          lt: m.i32.lt_s,
          and: m.i32.and,
          or: m.i32.or,
        };
        const rhs = exprs.pop()!;
        const lhs = exprs.pop()!;
        exprs.push(operations[c.type](lhs, rhs));

        if (c.type === "eq" || c.type === "lt" || c.type === "gt") {
          const e = exprs.pop()!;
          // exprs.push(m.select(e, m.i32.const(-1), m.i32.const(0)));
          exprs.push(m.select(e, m.i32.const(-1), m.i32.const(0)));
        }
        break;
      }
      case "return": {
        if (exprs.length < 1) {
          throw `Invalid Command: ${JSON.stringify(c)}`;
        }
        const ret = exprs.pop()!;
        exprs.push(m.return(ret));
        break;
      }
      case "call": {
        const [name, nargs] = c.args;
        if (exprs.length < nargs) {
          throw `Invalid Command: ${JSON.stringify(c)}`;
        }

        const args: number[] = [];
        for (let i = 0; i < nargs; i++) {
          args.push(exprs.pop()!);
        }
        args.reverse();

        exprs.push(m.call(name, args, i32));
        break;
      }
      case "function":
        throw `Unimplemented Command: ${JSON.stringify(c)}`;
      default:
        // const _: never = c.type;
        throw `Unimplemented Command: ${JSON.stringify(c)}`;
    }
  }

  return { label, refs: exprs, branch };
}
