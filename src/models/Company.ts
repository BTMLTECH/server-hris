import mongoose, { Document, Schema } from 'mongoose';

export interface ICompany extends Document {
  name: string;
  description?: string;
  roles: string; 
  department: string;
  status: string;
  createdAt: Date;
  branding?: {
      displayName?: string;
      logoUrl?: string;
      primaryColor?: string;
    }
}

const CompanySchema = new Schema<ICompany>({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, trim: true },
  roles: { type: String, trim: true , default:'admin'},
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  department: { type: String, trim: true , default:'admin'},
  branding: {
    displayName: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '#030577ab' }
  },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<ICompany>('Company', CompanySchema);


