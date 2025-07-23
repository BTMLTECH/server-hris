import mongoose, { Document, Schema } from 'mongoose';
import bcrypt  from 'bcryptjs';
import jwt from "jsonwebtoken";


interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}


export interface IUser extends Document {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  password: string;
  phoneNumber?: string;                
  dateOfBirth?: Date;                  
  address?: string;                    
  profileImage?: string;              
  position?: string;                   
  startDate?: Date;                    
  skills?: string[];                   
  education?: string;                  
  workExperience?: string;             
  emergencyContact?: EmergencyContact;   
 role:
 | 'md'
 | 'teamlead'
 | 'employee'
 | 'admin'
 | 'hr';
  biometryId?: string;
  department:  'it'
  | 'account'
  | 'hr'
  | 'channel'
  | 'retail'
  | 'operation'
  | 'corporate'
  | 'marketing'
  | 'md'
  | 'teamlead'
  | 'employee'
  | 'admin'
    | 'rg'
  | 'cm';
  company: mongoose.Types.ObjectId;
  isActive: boolean;
  failedLoginAttempts: number;
  lockUntil?: Date;
  resetRequested: boolean;
  resetRequestedAt?: Date;
  twoFactorEnabled: boolean;
  twoFactorCode?: string;
  twoFactorExpiry?: Date;
  resetToken?: string;
  resetTokenExpiry?: Date;
  createdAt: Date;
  hireDate?: string;
  salary: string;
  sendInvite: boolean,  
  status: 'active' | 'inactive' | 'terminated';
  SignAccessToken: () => string;
  SignRefreshToken: () => string;
  comparePassword(enteredPassword: string): Promise<boolean>; // Add method to interface
}

const UserSchema = new Schema<IUser>({
  firstName: { type: String, required: true, trim: true },
  middleName: { type: String, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  password: { type: String, select: false },
  role: {
  type: String,
  enum: [
    'employee',
    'md',
    'teamlead',
    'admin',
    'hr',
  ],
  default: 'employee',
  required: true,
  lowercase: true,
  trim: true,
},
  phoneNumber: { type: String, trim: true },
  dateOfBirth: Date,
  address: String,
  profileImage: String,
  position: String,
  startDate: Date,
  skills: [String],
  education: String,
  workExperience: String,
  emergencyContact: {
    name: { type: String, trim: true, default: '' },
    relationship: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
  },
  
department: {
  type: String,
  enum: [
    'it',
    'account',
    'hr',
    'channel',
    'retail',
    'operation',
    'corporate',
    'marketing',
    'md',
    'teamlead',
    'employee',
    'admin',
    'rg',
    'cm',
  ],
  required: true,
  lowercase: true,
  trim: true,
},
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  biometryId: { type: String, sparse: true }, 
  // resetRequests: { type: [String], default: [] },
  resetRequested: { type: Boolean, default: false },
  resetRequestedAt: Date,
  status: { type: String, enum: ['active', 'inactive', 'terminated'], default: 'active' },
  isActive: { type: Boolean, default: false },
  hireDate: String,
  salary: String,
  failedLoginAttempts: { type: Number, default: 0 },
  sendInvite: { type: Boolean, default: false },
  lockUntil: Date,
  twoFactorEnabled: { type: Boolean, default: true },
  twoFactorCode: String,
  twoFactorExpiry: Date,
  resetTokenExpiry: Date,
  resetToken: String,
  createdAt: { type: Date, default: Date.now },
});

// Hash password before saving
UserSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});


// Sign access token
UserSchema.methods.SignAccessToken = function () {
  return jwt.sign(
    { id: this._id, role: this.role, company: this.company },
    process.env.ACCESS_TOKEN || "", {
    expiresIn: "1d",
    // expiresIn: "1m",
  });
}; 

// Sign refresh token
UserSchema.methods.SignRefreshToken = function () {
  return jwt.sign(
    { id: this._id, role: this.role, company: this.company },
     process.env.REFRESH_TOKEN || "", {
    expiresIn: "7d",
  });
};


// Compare entered password with stored hash
UserSchema.methods.comparePassword  = async function (enteredPassword: string): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model<IUser>('User', UserSchema);
