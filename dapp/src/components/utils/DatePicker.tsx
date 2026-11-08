import { useState } from "react";
import { Button, Select } from "components/ui";

interface DatePickerProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** A day at least 24 hours away: a vote's end. */
export function DatePicker({ selectedDate, onDateChange }: DatePickerProps) {
  const [shown, setShown] = useState(selectedDate);
  const year = shown.getFullYear();
  const month = shown.getMonth();
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 20 }, (_, i) => thisYear - 10 + i);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  // Any day that would end the vote less than 24 hours from now.
  const tooSoon = (day: number) =>
    new Date(year, month, day).getTime() < Date.now() + DAY_MS;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <Select
          aria-label="Month"
          value={month}
          onChange={(event) =>
            setShown(new Date(year, Number(event.target.value), 1))
          }
        >
          {MONTHS.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Year"
          value={year}
          onChange={(event) =>
            setShown(new Date(Number(event.target.value), month, 1))
          }
        >
          {years.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-7 gap-1 border-b border-line pb-1">
        {WEEKDAYS.map((day, index) => (
          <span
            key={index}
            aria-hidden="true"
            className="flex size-10 items-center justify-center text-ui font-medium text-ink-muted"
          >
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }, (_, index) => (
          <span key={`empty-${index}`} className="size-10" />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const selected =
            selectedDate.getDate() === day &&
            selectedDate.getMonth() === month &&
            selectedDate.getFullYear() === year;
          return (
            <Button
              key={day}
              tone={selected ? "primary" : "ghost"}
              size="sm"
              className="size-10 px-0 sm:size-10"
              aria-pressed={selected}
              aria-label={`${day} ${MONTHS[month]} ${year}`}
              disabled={tooSoon(day)}
              onClick={() => onDateChange(new Date(year, month, day))}
            >
              {day}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
