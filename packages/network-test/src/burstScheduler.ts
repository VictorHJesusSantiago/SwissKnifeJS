import { CronExpressionParser } from "cron-parser";

export interface BurstSchedulerOptions {
  /** Expressão cron padrão (5 campos), ex.: "star-slash-10 * * * *" para a cada 10 minutos. */
  cronExpression: string;
  /** Função executada a cada disparo do agendamento. */
  task: () => Promise<void> | void;
  /** Número máximo de execuções antes de parar automaticamente (opcional, sem limite por padrão). */
  maxRuns?: number;
  /** Referência de data usada para calcular a próxima execução (facilita testes). */
  currentDate?: Date;
  onError?: (error: unknown) => void;
}

/** Calcula a data da próxima execução a partir de uma expressão cron, sem depender de infraestrutura externa. */
export function computeNextRun(cronExpression: string, currentDate: Date = new Date()): Date {
  const interval = CronExpressionParser.parse(cronExpression, { currentDate });
  return interval.next().toDate();
}

/** Calcula as próximas N execuções a partir de uma expressão cron (usado para pré-visualização e testes). */
export function computeNextRuns(cronExpression: string, count: number, currentDate: Date = new Date()): Date[] {
  const interval = CronExpressionParser.parse(cronExpression, { currentDate });
  const dates: Date[] = [];
  for (let index = 0; index < count; index += 1) dates.push(interval.next().toDate());
  return dates;
}

export interface BurstSchedulerHandle {
  stop: () => void;
  runsCompleted: () => number;
}

/**
 * Agenda execuções periódicas de um teste de rede localmente, usando `cron-parser` para calcular
 * o próximo disparo e um `setTimeout` recursivo para aguardá-lo — sem depender de nenhuma infra
 * externa (cron do SO, filas, etc.).
 */
export function startBurstScheduler(options: BurstSchedulerOptions): BurstSchedulerHandle {
  const { cronExpression, task, maxRuns, onError } = options;
  let runs = 0;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const scheduleNext = () => {
    if (stopped) return;
    if (maxRuns !== undefined && runs >= maxRuns) return;
    const next = computeNextRun(cronExpression, options.currentDate ?? new Date());
    const delayMs = Math.max(0, next.getTime() - Date.now());
    timer = setTimeout(async () => {
      if (stopped) return;
      try {
        await task();
      } catch (error) {
        onError?.(error);
      }
      runs += 1;
      scheduleNext();
    }, delayMs);
  };

  scheduleNext();

  return {
    stop: () => { stopped = true; if (timer) clearTimeout(timer); },
    runsCompleted: () => runs
  };
}
