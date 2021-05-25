import wat from "../wat";
import wabt from "wabt";

test("simple wasm", async () => {
  const x = 0,
    y = 1,
    sum = 2,
    j = 3;
  const m = wat.module([
    wat.func("$mult", [
      wat.export("mult"),
      wat.param("i32"), // x (0)
      wat.param("i32"), // y (1)
      wat.result("i32"),
      wat.local("i32"), // sum (2)
      wat.local("i32"), // j (3)

      wat.local.get(y),
      wat.local.set(j),

      wat.block([
        wat.loop([
          wat.local.get(j),
          wat.i32.const(0),
          wat.i32.eq(),
          wat.br_if(1),

          wat.local.get(sum),
          wat.local.get(x),
          wat.i32.add(),
          wat.local.set(sum),

          wat.local.get(j),
          wat.i32.const(1),
          wat.i32.sub(),
          wat.local.set(j),
          wat.br(0),
        ]),
      ]),
      wat.local.get(sum),
    ]),
  ]);

  const w = await wabt();
  const mod = w.parseWat("", m);
  const compiled = new WebAssembly.Module(mod.toBinary({}).buffer);

  const instance = new WebAssembly.Instance(compiled, {});
  const exports = instance.exports as any;

  expect(exports.mult(4, 111)).toBe(444);
});
