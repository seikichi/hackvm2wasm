import { ExpressionRef, Module, createType, i32 } from "binaryen";
import { Command } from "./hackvm";

export function compile(m: Module, fn: Command[]) {
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
      case "neg": {
        if (exprs.length < 1) {
          throw `Invalid Command: ${JSON.stringify(c)}`;
        }
        const ret = exprs.pop()!;
        exprs.push(m.i32.sub(m.i32.const(0), ret));
        continue;
      }
      case "not": {
        if (exprs.length < 1) {
          throw `Invalid Command: ${JSON.stringify(c)}`;
        }
        const ret = exprs.pop()!;
        exprs.push(m.i32.xor(ret, m.i32.const(-1)));
        continue;
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
        continue;
      }
      case "return": {
        if (exprs.length < 1) {
          throw `Invalid Command: ${JSON.stringify(c)}`;
        }
        const ret = exprs.pop()!;
        exprs.push(m.return(ret));
        continue;
      }
      default:
        throw `Unimplemented Command: ${JSON.stringify(c)}`;
    }
  }

  const body = exprs.length === 1 ? exprs[0] : m.block("block", exprs);
  m.addFunction(name, params, results, vars, body);
  m.addFunctionExport(name, name);
}
