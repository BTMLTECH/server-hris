import mongoose, { Schema, Document } from 'mongoose';

export interface ISalaryComponent {
  title: string;
  amount: number;
}

export interface IPayroll extends Document {
  employee: mongoose.Types.ObjectId;
  month: string;
  year: number;
  basicSalary: number;
  allowances: ISalaryComponent[];
  deductions: ISalaryComponent[];
  grossSalary: number;
  netSalary: number;
  tax: number;
  status: 'Pending' | 'Paid';
  paidDate?: Date;
  createdAt: Date;
}

const PayrollSchema = new Schema<IPayroll>({
  employee: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: String, required: true },
  year: { type: Number, required: true },
  basicSalary: { type: Number, required: true },
  allowances: [{ name: String, amount: Number }],
  deductions: [{ name: String, amount: Number }],
  grossSalary: { type: Number, required: true },
  netSalary: { type: Number, required: true },
  tax: { type: Number, required: true },
  status: { type: String, enum: ['Pending', 'Paid'], default: 'Pending' },
  paidDate: Date,
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IPayroll>('Payroll', PayrollSchema);
