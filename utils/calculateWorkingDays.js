"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateWorkingDays = void 0;
const publicHolidays = [
    '2024-01-01', // New Year's Day
    '2024-06-12', // Democracy Day
    '2024-10-01', // Independence Day
    // Add more Nigerian holidays here
];
const calculateWorkingDays = (start, end) => {
    let count = 0;
    let current = new Date(start);
    while (current <= end) {
        const day = current.getDay(); // 0 = Sunday, 6 = Saturday
        const dateStr = current.toISOString().split('T')[0];
        if (day !== 0 && day !== 6 && !publicHolidays.includes(dateStr)) {
            count++;
        }
        current.setDate(current.getDate() + 1);
    }
    return count;
};
exports.calculateWorkingDays = calculateWorkingDays;
