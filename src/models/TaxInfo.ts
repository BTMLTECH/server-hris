import mongoose, { Schema, Document } from 'mongoose';

export interface ITaxBand {
  band: number;
  amount: number;
}

export interface ITaxInfo extends Document {
  payrollId: mongoose.Types.ObjectId;   
  employeeId: mongoose.Types.ObjectId;  
  companyId: mongoose.Types.ObjectId;   
  CRA: number;
  pension: number;
  taxableIncome: number;
  tax: number;
  bands: ITaxBand[];
  createdAt: Date;
}

const TaxInfoSchema = new Schema<ITaxInfo>({
  payrollId: { type: Schema.Types.ObjectId, ref: 'Payroll', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  CRA: { type: Number, required: true },
  pension: { type: Number, required: true },
  taxableIncome: { type: Number, required: true },
  tax: { type: Number, required: true },
  bands: [
    {
      band: { type: Number },
      amount: { type: Number },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<ITaxInfo>('TaxInfo', TaxInfoSchema);
