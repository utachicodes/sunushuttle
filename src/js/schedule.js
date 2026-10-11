/** Finds the next departure time, allowing a 15 minute grace window after it passes. */
export function nextDeparture(departures) {
  if (!departures?.length) return null;
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  for (const time of departures) {
    const [h, m] = time.split(':').map(Number);
    const minutesAt = h * 60 + m;
    if (minutesAt >= minutesNow - 15) {
      return { time, minutesUntil: minutesAt - minutesNow };
    }
  }
  const [h, m] = departures[0].split(':').map(Number);
  return { time: departures[0], minutesUntil: h * 60 + m + (24 * 60 - minutesNow) };
}
