import { IDisposable } from './lifecycle';

export interface Event<T> {
  (
    listener: (event: T) => unknown,
    thisArgs?: unknown,
    disposables?: IDisposable[]
  ): IDisposable;
}

export class Emitter<T> implements IDisposable {
  private readonly listeners = new Set<{
    listener: (event: T) => unknown;
    thisArgs?: unknown;
  }>();

  readonly event: Event<T> = (listener, thisArgs, disposables) => {
    const entry = { listener, thisArgs };
    this.listeners.add(entry);

    let active = true;
    const subscription: IDisposable = {
      dispose: () => {
        if (!active) return;
        active = false;
        this.listeners.delete(entry);
      },
    };
    disposables?.push(subscription);
    return subscription;
  };

  fire(event: T): void {
    for (const { listener, thisArgs } of this.listeners) {
      listener.call(thisArgs, event);
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}

export namespace Event {
  export function debounce<Input, Output>(
    event: Event<Input>,
    merge: (last: Output | undefined, event: Input) => Output,
    delay: number
  ): Event<Output> {
    return (listener, thisArgs, disposables) => {
      let output: Output | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const inputSubscription = event(value => {
        output = merge(output, value);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = undefined;
          const valueToEmit = output!;
          output = undefined;
          listener.call(thisArgs, valueToEmit);
        }, delay);
      });

      let active = true;
      const subscription: IDisposable = {
        dispose: () => {
          if (!active) return;
          active = false;
          inputSubscription.dispose();
          if (timer) clearTimeout(timer);
          timer = undefined;
          output = undefined;
        },
      };
      disposables?.push(subscription);
      return subscription;
    };
  }
}
