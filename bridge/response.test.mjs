import { test } from "node:test";
import assert from "node:assert/strict";
import { readBoundedResponse } from "./response.mjs";

test("bounded proxy preserves response bytes up to the exact limit", async () => {
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(Uint8Array.from([1, 2]));
        controller.enqueue(Uint8Array.from([3, 4]));
        controller.close();
      },
    }),
  );
  assert.deepEqual(
    await readBoundedResponse(response, 4),
    Buffer.from([1, 2, 3, 4]),
  );
  assert.deepEqual(
    await readBoundedResponse(new Response(null), 4),
    Buffer.alloc(0),
  );
});

test("bounded proxy cancels an oversized streaming response without a length header", async () => {
  let cancelled = false,
    reads = 0;
  const response = new Response(
    new ReadableStream({
      pull(controller) {
        reads++;
        controller.enqueue(new Uint8Array(4));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  await assert.rejects(readBoundedResponse(response, 6), { status: 413 });
  assert.equal(cancelled, true);
  assert.ok(reads <= 3, "the entire upstream body must not be consumed");
});

test("bounded proxy rejects an oversized declared response before reading it", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
    {
      headers: { "content-length": "100" },
    },
  );
  await assert.rejects(readBoundedResponse(response, 6), { status: 413 });
  assert.equal(cancelled, true);
});

test("bounded proxy also enforces the limit when the declared size is incorrect", async () => {
  const response = new Response(new Uint8Array(9), {
    headers: { "content-length": "2" },
  });
  await assert.rejects(readBoundedResponse(response, 6), { status: 413 });
});
