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
