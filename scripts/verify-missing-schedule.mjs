import { saveAttendance } from "../server/db.ts";

const result = await saveAttendance({ studentId: 90002, journalDate: "2025-01-06", status: "absent", arrivalTime: null, userId: 1 });
console.log(JSON.stringify(result, null, 2));
process.exit(0);
