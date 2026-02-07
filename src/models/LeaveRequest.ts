import mongoose, { Schema, Document, Types } from 'mongoose';

export const LeaveEntitlements = {
  annual: 21,
  compassionate: 7,
  maternity: 90,
} as const;

export interface IReliever {
  user: Types.ObjectId;
  firstName: string;
  lastName: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  note?: string;
  creactedAt?: Date;
}

interface IReviewStep {
  reviewer?: Types.ObjectId;
  role: string;
  action?: 'Pending' | 'Approved' | 'Rejected' | 'Expired';
  date?: Date;
  note?: string;
}

export interface TypedRequestQuery {
  status?: string;
  from?: string;
  to?: string;
  limit?: string;
  page?: string;
}
export interface ILeaveRequest extends Document {
  user: Types.ObjectId;
  teamlead: Types.ObjectId;
  relievers: IReliever[];
  type: 'compassionate' | 'annual' | 'maternity';
  typeIdentify: 'leave';
  startDate: Date;
  endDate: Date;
  days?: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Expired';
  reviewLevels: ('reliever' | 'teamlead' | 'hr' | 'md')[];
  reviewTrail: IReviewStep[];
  allowance: boolean;
  isActive: boolean;     
  returned: boolean;     
  url?: string;
  createdAt: Date;
}


const LeaveRequestSchema = new Schema<ILeaveRequest>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  teamlead: { type: Schema.Types.ObjectId, ref: 'User', required: true },

  relievers: [
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending',
      },
      note: { type: String },
      creactedAt: { type: Date },
    },
  ],

  type: {
    type: String,
    enum: ['compassionate', 'annual', 'maternity'],
    required: true,
  },

  typeIdentify: { type: String, enum: ['leave'], required: true },

  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  days: { type: Number },
  reason: { type: String, required: true },

  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Expired'],
    default: 'Pending',
  },

    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    returned: {
      type: Boolean,
      default: false,
      index: true,
    },





//   reviewLevels: {
//   type: [{ type: String, enum: ['reliever', 'teamlead', 'hr', 'md'] }],

//   default: function () {
//     // Always enforce exactly 2 relievers
//     const relieverCount = 2;
//     const relievers = Array(relieverCount).fill('reliever');

//     // Default: Employee flow → include teamlead
//     return [...relievers, 'teamlead', 'hr', 'md'];
//   },

//   validate: {
//     validator: function (v: string[]) {
//       if (!Array.isArray(v)) return false;

//       // Must start with exactly 2 relievers
//       const relieversCount = v.filter(r => r === 'reliever').length;
//       if (relieversCount !== 2) return false;

//       // EMPLOYEE REQUEST → reliever, reliever, teamlead, hr, md
//       return (
//         v.length === 5 &&
//         v[0] === 'reliever' &&
//         v[1] === 'reliever' &&
//         v[2] === 'teamlead' &&
//         v[3] === 'hr' &&
//         v[4] === 'md'
//       );
//     },

//     message:
//       'Invalid review flow. Expected: reliever → reliever → teamlead → hr → md.',
//   },
// },
reviewLevels: {
  type: [{ type: String, enum: ['reliever', 'teamlead', 'hr', 'md'] }],
  required: true,
},


reviewTrail: [
    {
      reviewer: { type: Schema.Types.ObjectId, ref: 'User' },
      role: { type: String },
      action: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Expired'] },
      date: { type: Date },
      note: { type: String },
    },
  ],

  allowance: { type: Boolean, default: true },
  url: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<ILeaveRequest>('LeaveRequest', LeaveRequestSchema);
