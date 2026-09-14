import { test } from "node:test";
import assert from "node:assert/strict";
import { certificate, checkedHost } from "./certificate.mjs";
import { X509Certificate } from "node:crypto";
test("pairing certificate covers public and local addresses without relaxing TLS", async () => {
  const p = await certificate(["82.67.151.59", "192.168.1.8"]), cert = new X509Certificate(p.cert);
  assert.equal(cert.checkIP("82.67.151.59"), "82.67.151.59");
  assert.equal(cert.checkIP("192.168.1.8"), "192.168.1.8");
  assert.equal(cert.checkIP("203.0.113.7"), undefined);
  assert.throws(() => checkedHost("https://example.com/path"));
});
