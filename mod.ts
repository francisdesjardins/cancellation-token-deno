// Copyright (c) 2020 Francis Desjardins. All rights reserved. MIT license.

// interfaces

export interface CancellationTokenRegistration {
  unregister: () => void;
}

// types

export type CancellationTokenSourceRegisterCallback = { (): Promise<void> } | {
  (): void;
};

// enums

const enum CancellationState {
  CANNOT_BE_CANCELED = 0,
  NOT_CANCELED = 1,
  NOTIFYING = 2,
  NOTIFYING_COMPLETE = 3,
}

// symbols

const createFor = Symbol("createFor");

// helpers

function getCancellationTokenRegistration(
  unregister: CancellationTokenRegistration["unregister"] = () => void 0,
): CancellationTokenRegistration {
  return {
    unregister,
  };
}

function getStaticSource(cancelled: boolean): CancellationTokenSource {
  return cancelled ? staticSourceCancelled : staticSourceNotCancellable;
}

// definition

export class CancellationToken {
  public static get cancelled(): CancellationToken {
    return getStaticSource(true).token;
  }

  public static get none(): CancellationToken {
    return getStaticSource(false).token;
  }

  private static [createFor](
    source: CancellationTokenSource,
  ): CancellationToken {
    const token = new this();
    token.#source = source;
    return token;
  }

  #source: CancellationTokenSource;

  public constructor(cancelled: boolean = false) {
    this.#source = getStaticSource(cancelled);
  }

  public get cancellationRequested(): boolean {
    return this.#source.cancellationRequested ?? false;
  }

  public get canBeCanceled(): boolean {
    return this.#source.canBeCancelled ?? false;
  }

  public async register(
    cb: CancellationTokenSourceRegisterCallback,
  ): Promise<CancellationTokenRegistration> {
    if (!this.canBeCanceled) {
      return getCancellationTokenRegistration();
    }

    return this.#source.register(cb);
  }

  public throwIfCancellationRequested(): void {
    if (this.#source.cancellationRequested) {
      throw new Error("user cancelled");
    }
  }
}

export class CancellationTokenSource {
  public static async createLinkedTokenSource(
    tokens: CancellationToken[],
  ): Promise<CancellationTokenSource> {
    const source = new this();
    const sourceRegistrations: CancellationTokenRegistration[] = [];

    for (const token of [...tokens]) {
      if (token.canBeCanceled) {
        sourceRegistrations.push(
          await token.register(() => source.cancel()),
        );
      }
    }

    await source.register(() => {
      for (const sourceRegistration of sourceRegistrations) {
        sourceRegistration.unregister();
      }
    });

    return source;
  }

  #actions: Array<CancellationTokenSourceRegisterCallback> = [];
  #state = CancellationState.NOT_CANCELED;
  #timer?: ReturnType<typeof setTimeout>;

  constructor(cancelled?: boolean) {
    if (cancelled !== void 0) {
      this.#state = cancelled
        ? CancellationState.NOTIFYING_COMPLETE
        : CancellationState.CANNOT_BE_CANCELED;
    }
  }

  public get cancellationCompleted(): boolean {
    return this.#state === CancellationState.NOTIFYING_COMPLETE;
  }

  public get cancellationRequested(): boolean {
    return this.#state >= CancellationState.NOTIFYING;
  }

  public get canBeCancelled(): boolean {
    return this.#state !== CancellationState.CANNOT_BE_CANCELED;
  }

  public get token(): CancellationToken {
    return CancellationToken[createFor](this);
  }

  public async cancel(): Promise<void> {
    if (this.cancellationRequested) {
      return;
    }

    {
      this.#state = CancellationState.NOTIFYING;
      for (const action of [...this.#actions]) {
        await action();
      }
      this.#state = CancellationState.NOTIFYING_COMPLETE;
    }
  }

  public cancelAfter(timeout: number): void {
    if (this.cancellationRequested) {
      return;
    }

    if (timeout < 0) {
      throw new RangeError("timeout");
    }

    this.#timer =
      (clearTimeout(this.#timer), setTimeout(() => this.cancel(), timeout));
  }

  public async register(
    cb: CancellationTokenSourceRegisterCallback,
  ): Promise<CancellationTokenRegistration> {
    if (this.cancellationRequested) {
      await cb();

      return getCancellationTokenRegistration();
    }

    this.#actions.unshift(cb);

    return getCancellationTokenRegistration(
      () => {
        for (const [actionIndex, action] of this.#actions.entries()) {
          if (cb === action) {
            this.#actions.splice(actionIndex, 1);

            break;
          }
        }
      },
    );
  }
}

// statics

const staticSourceCancelled = new CancellationTokenSource(true);
const staticSourceNotCancellable = new CancellationTokenSource(false);
