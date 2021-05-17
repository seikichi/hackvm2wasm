import binaryen from "binaryen";

import { compile } from "../compiler";
import { parse } from "../hackvm";

test("simple add", () => {
  const commands = parse(`
    function test 0
      push constant 7
      push constant 8
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
  expect(e.test()).toBe(15);
});

test("simple comparison", () => {
  const commands = parse(`
    function test 0
      push constant 892
      push constant 891
      gt
      return
    `);

  const m = new binaryen.Module();
  compile(m, commands);

  expect(m.validate).toBeTruthy();

  const wasm = m.emitBinary();
  const compiled = new WebAssembly.Module(wasm);
  const instance = new WebAssembly.Instance(compiled, {});

  const e = instance.exports as any;
  expect(e.test()).toBe(-1);
});

test("simple arithmetic", () => {
  const commands = parse(`
    function test 0
      push constant 57
      push constant 31
      push constant 53
      add
      push constant 112
      sub
      neg
      and
      push constant 82
      or
      not
      return
    `);

  const m = new binaryen.Module();
  compile(m, commands);

  expect(m.validate).toBeTruthy();

  const wasm = m.emitBinary();
  const compiled = new WebAssembly.Module(wasm);
  const instance = new WebAssembly.Instance(compiled, {});

  const e = instance.exports as any;
  expect(e.test()).toBe(-91);
});
