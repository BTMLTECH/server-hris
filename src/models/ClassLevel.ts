import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IClassLevel extends Document {
  year: number;
  level: number;
  payGrade: string;
  basicSalary: number;
  housingAllowance?: number;
  transportAllowance?: number;
  lasgAllowance?: number;
  twentyFourHoursAllowance?: number;
  healthAllowance?: number;
  otherAllowance?: number;
  totalAllowances?: number;
  grossSalary?: number;
  createdAt: Date;
  updatedAt: Date;
  company: Types.ObjectId
}

const ClassLevelSchema = new Schema<IClassLevel>(
  {
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    year: { type: Number, required: true },
    level: { type: Number, required: true },
    payGrade: { type: String, required: true },
    basicSalary: { type: Number, required: true },
    housingAllowance: { type: Number, default: 0 },
    transportAllowance: { type: Number, default: 0 },
    lasgAllowance: { type: Number, default: 0 },
    twentyFourHoursAllowance: { type: Number, default: 0 },
    healthAllowance: { type: Number, default: 0 },
    otherAllowance: { type: Number, default: 0 },
    totalAllowances: { type: Number, default: 0 },
    grossSalary: { type: Number, default: 0 },
  },
  { timestamps: true }
);

function calculateSalaries(doc: IClassLevel) {
  doc.totalAllowances =
    (doc.housingAllowance || 0) +
    (doc.transportAllowance || 0) +
    (doc.lasgAllowance || 0) +
    (doc.twentyFourHoursAllowance || 0) +
    (doc.healthAllowance || 0) +
    (doc.otherAllowance || 0);

  doc.grossSalary = (doc.basicSalary || 0) + (doc.totalAllowances || 0);
}

// Runs for .save()
ClassLevelSchema.pre('save', function (next) {
  calculateSalaries(this as IClassLevel);
  next();
});

// Runs for insertMany()
ClassLevelSchema.pre('insertMany', function (next, docs: IClassLevel[]) {
  docs.forEach(doc => calculateSalaries(doc));
  next();
});

export default mongoose.model<IClassLevel>('ClassLevel', ClassLevelSchema);
