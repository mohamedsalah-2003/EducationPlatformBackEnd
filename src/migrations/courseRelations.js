const cleanSchedulePart = (value) => String(value ?? "").trim();

export const mergeSchedules = (...scheduleGroups) => {
  const seen = new Set();
  const merged = [];

  for (const schedule of scheduleGroups.flat()) {
    const day = cleanSchedulePart(schedule?.day);
    const time = cleanSchedulePart(schedule?.time);
    if (!day || !time) continue;

    const key = `${day.toLowerCase()}:${time.toLowerCase()}`;
    if (seen.has(key)) continue;

    seen.add(key);
    merged.push({ day, time });
  }

  return merged;
};

export const idsEqual = (left, right) =>
  Boolean(left && right && left.toString() === right.toString());
