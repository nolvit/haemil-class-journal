import type { Express, Request, Response } from "express";
import type { AttendanceLiveUpdate } from "../shared/attendanceLiveUpdates";
import { sdk } from "./_core/sdk";

type AttendanceLiveUpdateSubscriber = (event: AttendanceLiveUpdate) => void;

const subscribers = new Set<AttendanceLiveUpdateSubscriber>();

export function serializeAttendanceLiveUpdate(event: AttendanceLiveUpdate) {
  return `event: attendance\ndata: ${JSON.stringify(event)}\n\n`;
}

export function subscribeAttendanceLiveUpdates(
  subscriber: AttendanceLiveUpdateSubscriber
) {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function publishAttendanceLiveUpdate(event: AttendanceLiveUpdate) {
  subscribers.forEach(subscriber => subscriber(event));
}

export function registerAttendanceLiveUpdates(app: Express) {
  app.get(
    "/api/events/attendance",
    async (req: Request, res: Response) => {
      try {
        const user = await sdk.authenticateRequest(req);
        if (user.role !== "admin") {
          res.sendStatus(403);
          return;
        }
      } catch {
        res.sendStatus(401);
        return;
      }

      res.status(200).set({
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      res.write(": connected\n\n");

      const unsubscribe = subscribeAttendanceLiveUpdates(event => {
        res.write(serializeAttendanceLiveUpdate(event));
      });
      const heartbeat = setInterval(() => {
        res.write(": keep-alive\n\n");
      }, 25_000);
      heartbeat.unref();

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearInterval(heartbeat);
        unsubscribe();
      };
      req.on("close", cleanup);
      res.on("close", cleanup);
    }
  );
}
