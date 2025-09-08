import { ICompany } from "../models/Company";
import Notification, { INotification } from "../models/Notification";
import { IUser } from "../models/user.model";
import { sendEmail } from "./emailUtil";
import { Server as SocketIOServer } from "socket.io";


declare global {
  var io: SocketIOServer | undefined;
}

interface SendNotificationParams {
  user: IUser;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  emailSubject?: string;
  emailTemplate?: string;
  emailData?: Record<string, any>;
}

export const sendNotification = async ({
  user,
  type,
  title,
  message,
  metadata,
  emailSubject,
  emailTemplate,
  emailData,
}: SendNotificationParams): Promise<INotification> => {
  const notification = await Notification.create({
    user: user._id,
    company: user.company?._id,
    type,
    title,
    message,
    metadata,
    read: false,
  });

  // 2. Send email if provided
  if (emailSubject && emailTemplate) {
    await sendEmail(user.email, emailSubject, emailTemplate, {
      name: user.firstName,
      ...emailData,
    });
  }

  // 3. Emit real-time event
  const io = globalThis.io as any;
  if (io && user._id) {
    const roomId = user._id.toString();
    io.to(roomId).emit("notification:new", notification.toObject());
  }

  return notification;
};
