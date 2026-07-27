export function TransformDateAndTimeToDate(date: Date, time: string): Date {
  // Convert the date string to a Date object
  const dateObj = new Date(date);

  // Extract hours and minutes from the startTime string
  const [startHour, startMinute] = time.split(':').map(Number);

  // Set the hours and minutes to the desired time
  dateObj.setUTCHours(startHour, startMinute, 0, dateObj.getMilliseconds());

  // Return the updated Date object
  return dateObj;
}
