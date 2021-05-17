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

test("local and argument", () => {
  const commands = parse(`
    function test 1
      // local[0] = argument[0] + argument[1]
      push argument 0
      push argument 1
      add
      pop local 0

      // argument[0] = local[0]
      // argument[1] = local[0]
      push local 0
      pop argument 0
      push local 0
      pop argument 1

      // argument[0] + argument[1]
      push argument 0
      push argument 1
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
  expect(e.test(1, 20)).toBe(42);
});

test("pointer, this, that", () => {
  const commands = parse(`
    function test 0
      push constant 3030
      pop pointer 0
      push constant 3040
      pop pointer 1
      push constant 32
      pop this 2
      push constant 46
      pop that 6
      push pointer 0
      push pointer 1
      add
      push this 2
      sub
      push that 6
      add
      return
    `);

  const m = new binaryen.Module();

  // FIXME: Move the following code to compiler.ts
  m.addMemoryImport("0", "js", "mem");
  const mem = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  const imports = { js: { mem } };

  compile(m, commands);

  expect(m.validate).toBeTruthy();

  const wasm = m.emitBinary();
  const compiled = new WebAssembly.Module(wasm);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.test()).toBe(6084);

  const buf = new Int32Array(mem.buffer);
  expect(buf.length).toBe(32768);
  expect(buf[3032]).toBe(32);
  expect(buf[3046]).toBe(46);
});
