import mongoose, { Schema, Document, Types } from 'mongoose';
import { IUser } from './user.model';

export interface TaxBand {
  band: number;    
  amount: number;  
}

export interface IPayroll extends Document {
  user: mongoose.Types.ObjectId | IUser;          
  classLevel?:string; 
  company: mongoose.Types.ObjectId; 
  basicSalary: number;         
  totalAllowances: number;     
  grossSalary: number;
  pension: number;
  CRA: number;
  taxableIncome: number;
  tax: number;
  netSalary: number;
  taxBands: TaxBand[];
  month: number;                
  year: number;    
  status: "pending" | "draft" | "processed" | "reversed" | "paid";             
  createdAt: Date;
  updatedAt: Date;
}

const TaxBandSchema = new Schema<TaxBand>({
  band: { type: Number, required: true },
  amount: { type: Number, required: true },
}, { _id: false });

const PayrollSchema = new Schema<IPayroll>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  classLevel:String,
  basicSalary: { type: Number, required: true },
  totalAllowances: { type: Number, required: true },
  grossSalary: { type: Number, required: true },
   pension: { type: Number, required: true },
  CRA: { type: Number, required: true },
  taxableIncome: { type: Number, required: true },
  tax: { type: Number, required: true },
  netSalary: { type: Number, required: true },
  taxBands: { type: [TaxBandSchema], default: [] },
  status: {
  type: String,
  enum: ["draft", "pending", "processed", "reversed", "paid"],
  default: "pending", 
},
  month: { type: Number, required: true },
  year: { type: Number, required: true },
}, { timestamps: true });

export default mongoose.model<IPayroll>('Payroll', PayrollSchema);
