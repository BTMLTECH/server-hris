// utils/months.ts
export const monthNameToNumber = (month: string): number | null => {
  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const index = months.findIndex((m) => m.toLowerCase() === month.toLowerCase());
  return index === -1 ? null : index + 1;
};
