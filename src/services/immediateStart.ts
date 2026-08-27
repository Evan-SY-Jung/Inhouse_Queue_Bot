export const IMMEDIATE_START_DELAY_MINUTES = [
  10,
  15,
  20,
  30,
  45,
  60,
  90,
  120,
] as const;

export type ImmediateStartDelayMinutes =
  (typeof IMMEDIATE_START_DELAY_MINUTES)[number];

export function parseImmediateStartDelay(
  value: string | undefined,
): ImmediateStartDelayMinutes | null {
  if (!value) return null;

  const minutes = Number(value);
  return IMMEDIATE_START_DELAY_MINUTES.includes(
    minutes as ImmediateStartDelayMinutes,
  )
    ? (minutes as ImmediateStartDelayMinutes)
    : null;
}

export function scheduledAtFromDelay(
  now: number,
  delayMinutes: ImmediateStartDelayMinutes | null,
): number | null {
  return delayMinutes === null ? null : now + delayMinutes * 60_000;
}
