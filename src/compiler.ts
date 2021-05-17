import { ExpressionRef, Module, createType, i32 } from "binaryen";
import { Command } from "./hackvm";

export function compile(m: Module, fn: Command[]) {
  if (fn[0].type !== "function") {
    throw "Invalid Argument";
  }

  let nargs = 0;
  for (const c of fn) {
    if ((c.type === "push" || c.type === "pop") && c.args[0] === "argument") {
      nargs = Math.max(nargs, c.args[1] + 1);
    }
  }

  const [name, nlocals] = fn[0].args;
  const params = createType(new Array(nargs).fill(i32));
  const results = i32;
  const vars = new Array(nlocals + 2).fill(i32);
  const thisIndex = nargs + nlocals;
  const thatIndex = nargs + nlocals + 1;

  const exprs: ExpressionRef[] = [];

  for (const c of fn.slice(1)) {
    switch (c.type) {
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
          default:
            throw `Unimplemented Command: ${JSON.stringify(c)}`;
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
          default:
            throw `Unimplemented Command: ${JSON.stringify(c)}`;
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
      default:
        throw `Unimplemented Command: ${JSON.stringify(c)}`;
    }
  }

  const body = exprs.length === 1 ? exprs[0] : m.block("block", exprs);
  m.addFunction(name, params, results, vars, body);
  m.addFunctionExport(name, name);
}
