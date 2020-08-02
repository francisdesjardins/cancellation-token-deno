import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@v0.63.0/testing/asserts.ts";
import {
  CancellationTokenSource,
  CancellationToken,
} from "./mod.ts";

function beforeEach() {
  const testSource = new CancellationTokenSource();

  return {
    testSource,
    testToken: testSource.token,

    createToken: () => testSource.token,
  };
}

Deno.test(
  "CancellationTokenSource - should not be cancelled at instantiation",
  (): void => {
    const { testSource } = beforeEach();

    assertEquals(testSource.token.cancellationRequested, false);
  },
);

Deno.test(
  "CancellationTokenSource#createLinkedTokenSource - should notify when cancelling a linked source",
  async (): Promise<void> => {
    return new Promise(async (resolve) => {
      const source1 = new CancellationTokenSource();
      const source2 = new CancellationTokenSource();

      const tokens = [source1.token, source2.token];

      const source = await CancellationTokenSource.createLinkedTokenSource(
        tokens,
      );
      await source.register((): void => resolve());

      source2.cancel();
    });
  },
);

Deno.test("CancellationTokenSource#cancel - should be cancelled", (): void => {
  const { testSource } = beforeEach();

  testSource.cancel();

  assert(testSource.token.cancellationRequested);
  assert(testSource.cancellationCompleted);
});

Deno.test(
  'CancellationTokenSource#cancel - should throw "CancelError" when calling token.throwIfCancelled()',
  (): void => {
    const { testSource, testToken } = beforeEach();

    assertEquals(testToken.throwIfCancellationRequested(), void 0);

    testSource.cancel();

    assertThrows(
      (): void => testToken.throwIfCancellationRequested(),
      undefined,
      "user cancelled",
    );
  },
);

Deno.test(
  "CancellationTokenSource#cancel - should notify",
  async (): Promise<void> => {
    const { testSource, testToken } = beforeEach();

    return new Promise((resolve) => {
      testToken.register(() => resolve());

      testSource.cancel();
    });
  },
);

Deno.test(
  "CancellationTokenSource#cancel - should not notify twice",
  async (): Promise<void> => {
    const { testSource, testToken } = beforeEach();

    let count = 0;

    testToken.register((): number => ++count);

    testSource.cancel();
    testSource.cancel();

    assertEquals(count, 1);
  },
);

Deno.test(
  "CancellationTokenSource#cancel - should call registration synchronously in LIFO order",
  async (): Promise<void> => {
    const { createToken, testSource } = beforeEach();

    const token1 = createToken();
    const token2 = createToken();

    const results: string[] = [];

    await token2.register(() => results.push("last"));
    await token1.register(() =>
      new Promise((resolve) => {
        setTimeout(() => resolve((results.push("first"), void 0)), 100);
      })
    );

    setTimeout(() => {
      assert(testSource.cancellationRequested);
      assertEquals(testSource.cancellationCompleted, false);
    }, 50);

    return testSource.cancel().then(() => {
      assert(testSource.cancellationCompleted);
      assertEquals(results[0], "first");
      assertEquals(results[1], "last");
    });
  },
);

Deno.test(
  'CancellationTokenSource#cancelAfter - should throw a "RangeError" when timeout < 0',
  async (): Promise<void> => {
    const { testSource } = beforeEach();

    assertThrows((): void => testSource.cancelAfter(-100));
  },
);

Deno.test(
  "CancellationTokenSource#cancelAfter - should not reset state if cancellation was already requested",
  async (): Promise<void> => {
    const { testSource, testToken } = beforeEach();

    return new Promise((resolve) => {
      testSource.cancelAfter(50);

      assertEquals(testToken.cancellationRequested, false);

      setTimeout((): void => {
        assert(testToken.cancellationRequested);
        testSource.cancelAfter(50);
        assert(testToken.cancellationRequested);

        resolve();
      }, 100);
    });
  },
);

Deno.test(
  "CancellationTokenSource#register - should return a dummy registration if token cannot be cancelled",
  (): void => {
    const notCancellableTokenSource = new CancellationTokenSource(false);
    const notCancellableToken = notCancellableTokenSource.token;

    notCancellableToken.register(() => {
      throw new Error("should not have been notified");
    });

    notCancellableTokenSource.cancel();
  },
);

Deno.test(
  "CancellationTokenSource#register - should execute callback immediately if source is already cancelled",
  async (): Promise<void> => {
    const { testSource, testToken } = beforeEach();

    return new Promise((resolve) => {
      testSource.cancel();
      testToken.register(() => resolve());
    });
  },
);

Deno.test(
  "CancellationToken#cancelled - should return a cancelled token",
  (): void => {
    const token = CancellationToken.cancelled;

    assert(token.cancellationRequested);
    assert(token.canBeCanceled);
  },
);

Deno.test(
  "CancellationToken#none - should return a token that cannot be cancelled",
  (): void => {
    const token = CancellationToken.none;

    assertEquals(token.cancellationRequested, false);
    assertEquals(token.canBeCanceled, false);
  },
);
