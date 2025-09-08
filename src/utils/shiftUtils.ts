export const getCurrentShift = (
  override?: 'day' | 'night',
  baseDate: Date = new Date()
) => {
  const hour = baseDate.getHours();

  let shift: 'day' | 'night' = 'day';
  const startTime = new Date(baseDate);
  const endTime = new Date(baseDate);

  if (override) {
    shift = override;
  } else {
    shift = hour >= 8 && hour < 17 ? 'day' : 'night';
  }

  if (shift === 'day') {
    startTime.setHours(8, 30, 0, 0); // 8:30 AM
    endTime.setHours(17, 0, 0, 0);   // 5:00 PM
  } else {
    // Handle night shift that spans 2 days
    startTime.setHours(17, 0, 0, 0); // 5:00 PM same day
    endTime.setDate(endTime.getDate() + 1);
    endTime.setHours(5, 0, 0, 0);    // 5:00 AM next day
  }

  return { shift, startTime, endTime };
};


// Helper to format decimal hours (e.g. 7.5 => "7h 30m")
export const formatHours = (decimalHours: number): string => {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return `${hours}h ${minutes}m`;
};