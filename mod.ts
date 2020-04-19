// interfaces

export interface CancellationTokenUnregistration {
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

// helpers

function getCancellationTokenRegistration(
  unregister: () => void = () => void 0,
): CancellationTokenUnregistration {
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

  #source: CancellationTokenSource;

  public constructor(source: CancellationTokenSource) {
    this.#source = source;
  }

  public get cancellationRequested(): boolean {
    return this.#source.cancellationRequested;
  }

  public get canBeCanceled(): boolean {
    return this.#source.canBeCancelled;
  }

  public async register(
    cb: CancellationTokenSourceRegisterCallback,
  ): Promise<CancellationTokenUnregistration> {
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
    const sourceRegistrations: CancellationTokenUnregistration[] = [];

    for (const token of tokens) {
      if (token.canBeCanceled) {
        sourceRegistrations.push(
          await token.register(() => source.cancel()),
        );
      }
    }

    await source.register(async () => {
      for (const sourceRegistration of sourceRegistrations) {
        sourceRegistration.unregister();
      }
    });

    return source;
  }

  #registrations: Array<CancellationTokenSourceRegisterCallback> = [];
  #state = CancellationState.NOT_CANCELED;
  #timer: number | undefined;

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
    return new CancellationToken(this);
  }

  public async cancel(): Promise<void> {
    if (this.cancellationRequested) {
      return;
    }

    {
      this.#state = CancellationState.NOTIFYING;
      for (const registration of this.#registrations) {
        await registration();
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
  ): Promise<CancellationTokenUnregistration> {
    if (!this.cancellationRequested) {
      this.#registrations.unshift(cb);

      return getCancellationTokenRegistration(
        () => {
          const registrationIndex = this.#registrations.findIndex(
            (registration) => registration === cb,
          );

          if (registrationIndex > -1) {
            this.#registrations.splice(registrationIndex, 1);
          }
        },
      );
    }

    await cb();

    return getCancellationTokenRegistration();
  }
}

// statics

const staticSourceCancelled = new CancellationTokenSource(true);
const staticSourceNotCancellable = new CancellationTokenSource(false);
