import { sendNotification } from './sendNotification';
import User, { IUser } from '../models/user.model';
import Birthday from '../models/Birthday';

// export async function runBirthdayNotifications(company: any) {
//   const companyId = company?._id;
//   if (!companyId) throw new Error("Company not found");

//   const today = new Date();
//   const currentMonth = today.getMonth() + 1;
//   const currentDate = today.getDate();

//   const birthdayUsers = await User.find({
//     company: companyId,
//     dateOfBirth: { $exists: true },
//   });

//   const celebrants = birthdayUsers.filter(u => {
//     const dob = new Date(u.dateOfBirth!);
//     return dob.getDate() === currentDate && dob.getMonth() + 1 === currentMonth;
//   });

//   for (const user of celebrants) {
//     await sendNotification({
//       user,
//       type: "INFO",
//       title: "🎉 Happy Birthday!",
//       message: `Happy Birthday ${user.firstName}!`,
//       emailSubject: `Happy Birthday ${user.firstName}!`,
//       emailTemplate: "birthday.ejs",
//       emailData: {
//         name: user.firstName,
//         companyName: company?.branding?.displayName || company?.name,
//         logoUrl: company?.branding?.logoUrl,
//       },
//     });
//   }

//   return celebrants;
// }

export async function seedMonthlyBirthdays(company: any) {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;

  const users = await User.find({
    company: company._id,
    dateOfBirth: { $exists: true },
  });

  for (const user of users) {
    const dob = new Date(user.dateOfBirth!);
    if (dob.getMonth() + 1 !== currentMonth) {
      continue;
    }

    const coExisting = await Birthday.findOne({
      user: user._id,
      month: dob.getMonth() + 1,
      day: dob.getDate(),
      year: dob.getFullYear(),
    });

    if (!coExisting) {
      await Birthday.create({
        user: user._id,
        staffId: user.staffId,
        company: company._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profileImage: user.profileImage,
        dateOfBirth: dob,
        month: dob.getMonth() + 1,
        day: dob.getDate(),
        year: dob.getFullYear(),
      });
    } else {
    }
  }
}

export async function runBirthdayNotifications(company: any) {
  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth() + 1;

  const birthdaysToday = await Birthday.find({
    company: company._id,
    day: todayDay,
    month: todayMonth,
    dateCelebrated: null,
  }).populate<{ user: IUser }>('user');

  for (const record of birthdaysToday) {
    const user = record.user;

    await sendNotification({
      user,
      type: 'INFO',
      title: '🎉 Happy Birthday!',
      message: `Happy Birthday ${user.firstName}!`,
      emailSubject: `Happy Birthday ${user.firstName}!`,
      emailTemplate: 'birthday.ejs',
      emailData: {
        name: user.firstName,
        companyName: company?.branding?.displayName || company?.name,
        logoUrl: company?.branding?.logoUrl,
      },
    });

    // Mark birthday as celebrated for today
    record.dateCelebrated = today;
    await record.save();
  }

  return birthdaysToday;
}
