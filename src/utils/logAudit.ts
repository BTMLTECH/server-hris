import AuditLog from '../models/AuditLog';


interface LogParams {
  userId: string | any;
  action: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  ip?: string;
  userAgent?: string;
  companyId?: string
}

export const logAudit = async ({ userId, action, status, ip, userAgent, companyId }: LogParams): Promise<void> => {
  try {
    await AuditLog.create({
      user: userId,
      action,
      status,
      ipAddress: ip,
      userAgent,
      companyId,
    });
  } catch (err) {
  }
};
