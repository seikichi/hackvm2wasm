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

  const m = compile([commands]);
  const mem = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  const imports = { js: { mem } };

  const wasm = m.emitBinary();
  const compiled = new WebAssembly.Module(wasm);
  const instance = new WebAssembly.Instance(compiled, imports);

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

  const m = compile([commands]);
  const mem = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  const imports = { js: { mem } };

  const wasm = m.emitBinary();
  const compiled = new WebAssembly.Module(wasm);
  const instance = new WebAssembly.Instance(compiled, imports);

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

  const m = compile([commands]);
  const mem = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  const imports = { js: { mem } };

  const wasm = m.emitBinary();
  const compiled = new WebAssembly.Module(wasm);
  const instance = new WebAssembly.Instance(compiled, imports);

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

  const m = compile([commands]);
  const mem = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  const imports = { js: { mem } };

  const wasm = m.emitBinary();
  const compiled = new WebAssembly.Module(wasm);
  const instance = new WebAssembly.Instance(compiled, imports);

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

  const mem = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  const imports = { js: { mem } };

  const m = compile([commands]);
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

test("temp", () => {
  const commands = parse(`
    function test 0
      push constant 1
      pop temp 0
      push constant 2
      pop temp 1
      push constant 3
      pop temp 2
      push constant 4
      pop temp 3
      push constant 5
      pop temp 4
      push constant 6
      pop temp 5
      push constant 7
      pop temp 6
      push constant 8
      pop temp 7
      push temp 0
      push temp 1
      push temp 2
      push temp 3
      push temp 4
      push temp 5
      push temp 6
      push temp 7
      add
      add
      add
      add
      add
      add
      add
      return
    `);

  const mem = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  const imports = { js: { mem } };

  const m = compile([commands]);

  const wasm = m.emitBinary();
  const compiled = new WebAssembly.Module(wasm);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.test()).toBe(36);
});

test("static", () => {
  const commands = parse(`
    function test 0
      push constant 1
      pop static 0
      push constant 41
      pop static 10
      push static 10
      push static 0
      add
      return
    `);

  const mem = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  const imports = { js: { mem } };

  const m = compile([commands]);

  const wasm = m.emitBinary();
  const compiled = new WebAssembly.Module(wasm);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.test()).toBe(42);
});

test("simple function", () => {
  const commands = parse(`
    function f1 0
      push argument 0
      push argument 1
      add
      return

    function f2 0
      push argument 0
      push argument 1
      call f1 2
      return

    function test 0
      push constant 1
      push constant 41
      call f2 2
      return
    `);

  const mem = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  const imports = { js: { mem } };

  const m = compile([commands]);

  const wasm = m.emitBinary();
  const compiled = new WebAssembly.Module(wasm);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.test()).toBe(42);
});

test("multiple static", () => {
  const class1 = parse(`
    function Class1.set 0
    push argument 0
    pop static 0
    push argument 1
    pop static 1
    push constant 0
    return

    // Returns static[0] - static[1].
    function Class1.get 0
    push static 0
    push static 1
    sub
    return
  `);
  const class2 = parse(`
    function Class2.set 0
    push argument 0
    pop static 0
    push argument 1
    pop static 1
    push constant 0
    return

    // Returns static[0] - static[1].
    function Class2.get 0
    push static 0
    push static 1
    sub
    return
  `);
  const sys = parse(`
    function Sys.init 0
    push constant 6
    push constant 8
    call Class1.set 2
    pop temp 0 // Dumps the return value
    push constant 23
    push constant 15
    call Class2.set 2
    pop temp 0 // Dumps the return value
    call Class1.get 0
    call Class2.get 0
    add // (6 - 8) + (23 - 15) = 6
    return
  `);

  const mem = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  const imports = { js: { mem } };

  const m = compile([class1, class2, sys]);

  const wasm = m.emitBinary();
  const compiled = new WebAssembly.Module(wasm);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e["Sys.init"]()).toBe(6);
});

test.only("label, goto, if-goto: mult", () => {
  const commands = parse(`
    function mult 2
      push constant 0
      pop local 0
      push argument 1
      pop local 1

      label LOOP
      push constant 0
      push local 1
      eq
      if-goto END

      push local 0
      push argument 0
      add
      pop local 0
      push local 1
      push constant 1
      sub
      pop local 1
      goto LOOP

      label END
      push local 0
      return
    `);

  const m = compile([commands]);
  m.optimize();
  const mem = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  const imports = { js: { mem } };

  const wasm = m.emitBinary();
  const compiled = new WebAssembly.Module(wasm);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.mult(6, 111)).toBe(666);
});

test("label, goto, if-goto: mult", () => {
  const commands = parse(`
    function mult 2
      push constant 0
      pop local 0
      push argument 1
      pop local 1

      label LOOP
      push constant 0
      push local 1
      eq
      if-goto END

      push local 0
      push argument 0
      add
      pop local 0
      push local 1
      push constant 1
      sub
      pop local 1
      goto LOOP

      label END
      push local 0
      return
    `);

  const m = compile([commands]);
  m.optimize();
  const mem = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  const imports = { js: { mem } };

  const wasm = m.emitBinary();
  const compiled = new WebAssembly.Module(wasm);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.mult(6, 111)).toBe(666);
});

test.only("basic loop", () => {
  const commands = parse(`
    function test 1
      // Computes the sum 1 + 2 + ... + argument[0] and pushes the
      // result onto the stack. Argument[0] is initialized by the test
      // script before this code starts running.
      push constant 0
      pop local 0         // initializes sum = 0

      label LOOP_START
      push argument 0
      push local 0
      add
      pop local 0	        // sum = sum + counter
      push argument 0
      push constant 1
      sub
      pop argument 0      // counter--
      push argument 0
      if-goto LOOP_START  // If counter != 0, goto LOOP_START

      push local 0
      return
    `);

  const m = compile([commands]);
  m.optimize();
  const mem = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  const imports = { js: { mem } };

  const wasm = m.emitBinary();
  const compiled = new WebAssembly.Module(wasm);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.test(10)).toBe(55);
});
