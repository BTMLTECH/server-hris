
import { sendNotification } from "./sendNotification";
import User from "../models/user.model";





export async function runBirthdayNotifications(company: any) {
  const companyId = company?._id;
  if (!companyId) throw new Error("Company not found");

  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentDate = today.getDate();

  const birthdayUsers = await User.find({
    company: companyId,
    dateOfBirth: { $exists: true },
  });

  const celebrants = birthdayUsers.filter(u => {
    const dob = new Date(u.dateOfBirth!);
    return dob.getDate() === currentDate && dob.getMonth() + 1 === currentMonth;
  });

  for (const user of celebrants) {
    await sendNotification({
      user,
      type: "INFO",
      title: "🎉 Happy Birthday!",
      message: `Happy Birthday ${user.firstName}!`,
      emailSubject: `Happy Birthday ${user.firstName}!`,
      emailTemplate: "birthday.ejs",
      emailData: {
        name: user.firstName,
        companyName: company?.branding?.displayName || company?.name,
        logoUrl: company?.branding?.logoUrl,
      },
    });
  }

  return celebrants;
}
