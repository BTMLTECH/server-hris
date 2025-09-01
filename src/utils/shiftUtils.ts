"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatHours = exports.getCurrentShift = void 0;
const getCurrentShift = (override, baseDate = new Date()) => {
    const hour = baseDate.getHours();
    let shift = 'day';
    const startTime = new Date(baseDate);
    const endTime = new Date(baseDate);
    if (override) {
        shift = override;
    }
    else {
        shift = hour >= 8 && hour < 17 ? 'day' : 'night';
    }
    if (shift === 'day') {
        startTime.setHours(8, 30, 0, 0); // 8:30 AM
        endTime.setHours(17, 0, 0, 0); // 5:00 PM
    }
    else {
        // Handle night shift that spans 2 days
        startTime.setHours(17, 0, 0, 0); // 4:00 PM same day
        endTime.setDate(endTime.getDate() + 1);
        endTime.setHours(5, 0, 0, 0); // 5:00 AM next day
    }
    return { shift, startTime, endTime };
};
exports.getCurrentShift = getCurrentShift;
// Helper to format decimal hours (e.g. 7.5 => "7h 30m")
const formatHours = (decimalHours) => {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours}h ${minutes}m`;
};
exports.formatHours = formatHours;
