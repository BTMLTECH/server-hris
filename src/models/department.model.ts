import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDepartment extends Document {
  name: string;
  supervisor?: string;
  sopDocument?: string; 
  company: Types.ObjectId; 
}

const DepartmentSchema = new Schema<IDepartment>({
  name: { type: String, required: true, trim: true, unique: true },
  supervisor: { type: String, trim: true },
  sopDocument: { type: String, trim: true },
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true }
}, { timestamps: true });

export default mongoose.model<IDepartment>('Department', DepartmentSchema);
