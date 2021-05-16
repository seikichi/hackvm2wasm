import binaryen from "binaryen";

import { compile } from "../compiler";
import { parse } from "../hackvm";

test("test simple function", () => {
  const commands = parse(`
    function answer 0
      push constant 1
      push constant 41
      add
      return
    `);

  const m = new binaryen.Module();
  compile(m, commands);

  expect(m.validate).toBeTruthy();

  const wasm = m.emitBinary();
  const compiled = new WebAssembly.Module(wasm);
  const instance = new WebAssembly.Instance(compiled, {});

  const e = instance.exports as any;
  expect(e.answer()).toBe(42);
});
