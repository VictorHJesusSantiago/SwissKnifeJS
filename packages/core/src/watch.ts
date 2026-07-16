import { watch } from "node:fs";

export interface WatchOptions {
  debounceMs?: number;
  recursive?: boolean;
}

export function watchAndRun(target: string, run: () => void | Promise<void>, options: WatchOptions = {}): () => void {
  const debounceMs = options.debounceMs ?? 200;
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let pending = false;

  const trigger = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void execute(), debounceMs);
  };

  const execute = async (): Promise<void> => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await run();
    } finally {
      running = false;
      if (pending) {
        pending = false;
        trigger();
      }
    }
  };

  const watcher = watch(target, { recursive: options.recursive ?? true }, () => trigger());
  void execute();
  return () => watcher.close();
}
