import binaryen, { ExpressionRef } from "binaryen";
import { parse, Command } from "./src/hackvm";

const commands = parse(`
function answer 0
push constant 1
push constant 41
add
return
`);

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
