import { asyncHandler } from "../middleware/asyncHandler";
import { TypedRequest } from "../types/typedRequest";
import { TypedResponse } from "../types/typedResponse";
import { sendNotification } from "./sendNotification";
import User from "../models/user.model";


export const sendBirthdayNotifications = asyncHandler(
  async (req: TypedRequest<{}, {}, {}>, res: TypedResponse<any>, next) => {
    const company = req.company;
    const companyId = company?._id;

    if (!companyId) return next(new Error('Company not found'));

    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentDate = today.getDate();

    // Find users whose birthday is today
    const birthdayUsers = await User.find({
      company: companyId,
      dateOfBirth: { $exists: true },
    });

    const celebrants = birthdayUsers.filter(u => {
      const dob = new Date(u.dateOfBirth!);
      return dob.getDate() === currentDate && dob.getMonth() + 1 === currentMonth;
    });

    // Send notifications
    for (const user of celebrants) {
      await sendNotification({
        user,
        type: 'INFO',
        title: '🎉 Happy Birthday!',
        message: `Happy Birthday ${user.firstName}! Wishing you a wonderful day!`,
        emailSubject: `Happy Birthday ${user.firstName}!`,
        emailTemplate: 'birthday.ejs',
        emailData: {
          name: user.firstName,
          companyName: company?.branding?.displayName || company?.name,
          logoUrl: company?.branding?.logoUrl,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: `${celebrants.length} birthday notification(s) sent.`,
      data: celebrants.map(u => ({ name: u.firstName, email: u.email })),
    });
  }
);
