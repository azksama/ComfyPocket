import { expect, test } from "vitest";
import { parsePairing } from "./pairing";

const valid = {
  url: "https://192.168.1.8:8189",
  token: "x".repeat(64),
  certificate: "test certificate",
};
const parse = (changes: Record<string, unknown>) =>
  parsePairing(JSON.stringify({ ...valid, ...changes }));

test("pairing normalizes an origin and surrounding pasted whitespace", () => {
  expect(
    parse({
      url: " https://PC.EXAMPLE:443/ ",
      token: ` ${valid.token}\n`,
      certificate: " cert\n",
    }),
  ).toEqual({
    url: "https://pc.example",
    token: valid.token,
    certificate: "cert",
  });
  expect(parse({ url: "https://[2001:db8::1]:8189/" }).url).toBe(
    "https://[2001:db8::1]:8189",
  );
});

test("pairing rejects URLs the native client cannot use", () => {
  for (const url of [
    "http://pc:8189",
    "https://user:secret@pc",
    "https://pc/path",
    "https://pc/?key=x",
    "https://pc/#x",
    "invalid",
  ]) {
    expect(() => parse({ url })).toThrow();
  }
});

test("pairing rejects wrong types and excessive or malformed credentials without including them in errors", () => {
  for (const changes of [
    { token: {} },
    { certificate: [] },
    { url: 123 },
    { token: "short" },
    { token: "x".repeat(257) },
    { token: "x".repeat(32) + "\nsecret" },
    { certificate: "" },
    { certificate: "x".repeat(65537) },
  ]) {
    expect(() => parse(changes)).toThrow();
  }
  for (const text of [
    "null",
    "[]",
    '{"token":"secret-value',
    " ".repeat(100001),
  ]) {
    try {
      parsePairing(text);
      throw new Error("accepted");
    } catch (error) {
      expect(String(error)).not.toContain("secret-value");
      expect(String(error)).not.toContain("accepted");
    }
  }
});
