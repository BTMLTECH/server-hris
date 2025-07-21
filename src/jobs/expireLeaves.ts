import LeaveRequest from '../models/LeaveRequest';
import { sendNotification } from '../utils/sendNotification';

export const expireUnreviewedLeaves = async () => {
  const now = new Date();

  const expiredLeaves = await LeaveRequest.find({
    status: 'Pending',
    endDate: { $lt: now },
  }).populate('user', 'firstName lastName email');

  if (expiredLeaves.length === 0) {
    return;
  }

  const bulkOps = expiredLeaves.map((leave) => ({
    updateOne: {
      filter: { _id: leave._id },
      update: { $set: { status: 'Expired' } },
    },
  }));

  await LeaveRequest.bulkWrite(bulkOps);

  for (const leave of expiredLeaves) {
    const employee = leave.user as any;

    await sendNotification({
      user: employee,
      type: 'WARNING',
      title: 'Leave Request Expired ⚠️',
      message: `Your ${leave.type} leave request from ${leave.startDate.toDateString()} to ${leave.endDate.toDateString()} has expired without action.`,
      emailSubject: 'Leave Request Expired',
      emailTemplate: 'leave-expired.ejs',  // You'll need to create this template
      emailData: {
        name: employee.firstName,
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: leave.days,
      },
    });
  }

};
