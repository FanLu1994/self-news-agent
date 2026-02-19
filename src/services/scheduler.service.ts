function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseTimeToMinute(time: string): number | null {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function getLocalTimeParts(timezone: string): { hour: number; minute: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
  const parts = dtf.formatToParts(new Date());
  const hour = Number.parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = Number.parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return { hour, minute };
}

export class SchedulerService {
  async runTwiceDaily(options: {
    times: string[];
    timezone: string;
    task: () => Promise<void>;
  }): Promise<void> {
    const targetMinutes = options.times
      .map(parseTimeToMinute)
      .filter((v): v is number => typeof v === 'number');

    if (targetMinutes.length === 0) {
      throw new Error('DIGEST_SCHEDULE_TIMES 未配置有效时间，例如 09:00,18:00');
    }

    const executedMarks = new Set<string>();
    while (true) {
      const now = new Date();
      const { hour, minute } = getLocalTimeParts(options.timezone);
      const currentMinute = hour * 60 + minute;
      const dayMark = now.toISOString().slice(0, 10);
      const mark = `${dayMark}-${currentMinute}`;

      if (targetMinutes.includes(currentMinute) && !executedMarks.has(mark)) {
        try {
          await options.task();
          console.log(`[scheduler] 执行完成: ${options.timezone} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
        } catch (error) {
          console.error('[scheduler] 执行失败:', error);
        }
        executedMarks.add(mark);
      }

      if (executedMarks.size > 20) {
        const latest = [...executedMarks].slice(-10);
        executedMarks.clear();
        latest.forEach(item => executedMarks.add(item));
      }

      await sleep(20 * 1000);
    }
  }
}

export const schedulerService = new SchedulerService();
