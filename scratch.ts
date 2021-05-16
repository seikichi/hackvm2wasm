import binaryen, { ExpressionRef } from "binaryen";
import { compile } from "./src/compiler";
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

const m = new binaryen.Module();

compile(m, commands);
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
