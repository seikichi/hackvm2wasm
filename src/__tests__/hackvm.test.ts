import { parseLine, Command } from "../hackvm";

test.each<[string, Command]>([
  ["add", { type: "add" }],
  ["label LOOP", { type: "label", args: ["LOOP"] }],
  ["push constant 42", { type: "push", args: ["constant", 42] }],
])(`parseLine(%j) returns %j`, (line, expected) => {
  expect(parseLine(line)).toStrictEqual(expected);
});
