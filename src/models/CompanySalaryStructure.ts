import mongoose, { Schema, Document } from 'mongoose';

export interface ICompanySalaryStructure extends Document {
  company: mongoose.Types.ObjectId;
  basicSalary: number;
  allowances: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  taxPercentage: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CompanySalaryStructureSchema = new Schema<ICompanySalaryStructure>({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, unique: true },
  basicSalary: { type: Number, default: 0 },
  allowances: [
    {
      name: { type: String, required: true },
      amount: { type: Number, required: true },
    },
  ],
  deductions: [
    {
      name: { type: String, required: true },
      amount: { type: Number, required: true },
    },
  ],
  taxPercentage: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export default mongoose.model<ICompanySalaryStructure>('CompanySalaryStructure', CompanySalaryStructureSchema);