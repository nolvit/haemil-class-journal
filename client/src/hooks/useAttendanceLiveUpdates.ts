import {
  parseAttendanceLiveUpdate,
  type AttendanceLiveUpdate,
} from "@shared/attendanceLiveUpdates";
import { useEffect, useRef } from "react";

export function useAttendanceLiveUpdates(
  onUpdate: (event: AttendanceLiveUpdate) => void
) {
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    const events = new EventSource("/api/events/attendance");
    const handleAttendance = (message: MessageEvent<string>) => {
      const event = parseAttendanceLiveUpdate(message.data);
      if (event) onUpdateRef.current(event);
    };
    events.addEventListener("attendance", handleAttendance as EventListener);
    return () => {
      events.removeEventListener(
        "attendance",
        handleAttendance as EventListener
      );
      events.close();
    };
  }, []);
}
