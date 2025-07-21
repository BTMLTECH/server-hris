import mongoose, { Schema, Document } from 'mongoose';

export interface ILoanRepayment extends Document {
  loanId: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  amountPaid: number;
  paymentDate: Date;
}

const LoanRepaymentSchema = new Schema<ILoanRepayment>({
  loanId: { type: Schema.Types.ObjectId, ref: 'LoanRequest', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  amountPaid: { type: Number, required: true },
  paymentDate: { type: Date, default: Date.now },
});

export default mongoose.model<ILoanRepayment>('LoanRepayment', LoanRepaymentSchema);
