import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NIGERIAN_BANKS, NIGERIAN_STATES, PFA_COMPANIES } from "../constant/const";
import { ICompany } from "./Company";
import { IOnboardingRequirement } from "./OnboardingRequirement";


export interface NextOfKin {
  name?: string;
  phone?: string;
  email?: string;
  relationship?: string;
}

export interface AccountInfo {
  classLevel?: string;
  basicPay?: number;
  allowances?: number;
  bankAccountNumber?: string;
  bankName?: string;
  taxNumber?: string;
  pensionCompany?: string;
  pensionNumber?: string;
}

export interface CooperativeInfo {
  monthlyContribution?: number;
  totalContributed?: number;
  lastContributionDate?: Date;
}

export interface IUser extends Document {
  staffId: string;
  title: "Mr" | "Mrs" | "Ms" | "Dr" | "Prof";
  firstName: string;
  middleName?: string;
  lastName: string;
  gender: "male" | "female";
  dateOfBirth?: Date;
  stateOfOrigin?: string;
  address?: string;
  city?: string;
  mobile?: string;
  profileImage?: string;
  nextOfKin?: NextOfKin;
  email: string;
  password: string;
  department:
    | "it"
    | "account"
    | "hr"
    | "channel"
    | "retail"
    | "operation"
    | "operationsbu"
    | "corporate"
    | "marketing"
    | "md"
    | "teamlead"
    | "employee"
    | "admin"
    | "rgogh"
    | "roaghi";
  position?: string;
  level?: string;
  officeBranch?: "Head Office" | "Shell SBU";
  employmentDate?: Date;
  accountInfo?: AccountInfo;
  role: "employee" | "md" | "teamlead" | "admin" | "hr" ;
  company: mongoose.Types.ObjectId | ICompany;
  status: "active" | "inactive" | "terminated";
  terminationDate?: Date;
  isActive: boolean;
  failedLoginAttempts: number;
  lockUntil?: Date;
  resetRequested: boolean;
  resetRequestedAt?: Date;
  twoFactorEnabled: boolean;
  cooperative?: CooperativeInfo;
  twoFactorCode?: string;
  twoFactorExpiry?: Date;
  resetToken?: string;
  requirements?: IOnboardingRequirement[];
  resetTokenExpiry?: Date;
  createdAt: Date;

  // Methods
  SignAccessToken(): string;
  SignRefreshToken(): string;
  comparePassword(enteredPassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    staffId: { type: String, required: true, unique: true },
    title: {
      type: String,
      enum: ["Mr", "Mrs", "Ms", "Dr", "Prof"],
      required: true,
    },
    firstName: { type: String, required: true, trim: true },
    middleName: { type: String, trim: true },
    lastName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["male", "female"], required: true },
    dateOfBirth: Date,
    stateOfOrigin: { type: String, enum: NIGERIAN_STATES },
    address: String,
    city: String,
    mobile: String,
    profileImage: String,
    nextOfKin: {
      name: String,
      phone: String,
      email: String,
      relationship: String,
    },
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, select: false },
    department: {
      type: String,
      enum: [
        "it",
        "account",
        "hr",
        "channel",
        "retail",
        "operation",
        "operationsbu",
        "corporate",
        "marketing",
        "md",
        "teamlead",
        "employee",
        "admin",
        "rgogh",
        "roaghi",
      ],
      required: true,
    },
    position: String,
    level: String,
    officeBranch: {
      type: String,
      enum: ["Head Office", "Shell SBU"],
      required: false,
    },
    employmentDate: Date,
    accountInfo: {
      classLevel: String,
      basicPay: Number,
      allowances: Number,
      bankAccountNumber: String,
      bankName: { type: String, enum: NIGERIAN_BANKS },
      taxNumber: String,
      pensionCompany: { type: String, enum: PFA_COMPANIES },
      pensionNumber: String,
    },
    role: {
      type: String,
      enum: ["employee", "md", "teamlead", "admin", "hr", "reliever"],
      default: "employee",
    },
    company: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    status: {
      type: String,
      enum: ["active", "inactive", "terminated"],
      default: "active",
      required: true,
    },
    terminationDate: { type: Date, default: null },
    isActive: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
    resetRequested: { type: Boolean, default: false },
    resetRequestedAt: Date,
    twoFactorEnabled: { type: Boolean, default: true },
    cooperative: {
      monthlyContribution: { type: Number, default: 0 },
      totalContributed: { type: Number, default: 0 },
      lastContributionDate: Date,
    },
    twoFactorCode: String,
    twoFactorExpiry: Date,
    resetToken: String,
    resetTokenExpiry: Date,
    createdAt: { type: Date, default: Date.now },
  },
  { toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

UserSchema.virtual("requirements", {
  ref: "OnboardingRequirement",
  localField: "_id",
  foreignField: "employee",
});

// Middleware
UserSchema.pre("save", function (next) {
  if (this.status === "terminated" && !this.terminationDate) {
    this.terminationDate = new Date();
  }
  next();
});

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Methods
UserSchema.methods.SignAccessToken = function (): string {
  return jwt.sign(
    { id: this._id, role: this.role, company: this.company },
    process.env.ACCESS_TOKEN || "",
    { expiresIn: "1d" }
  );
};

UserSchema.methods.SignRefreshToken = function (): string {
  return jwt.sign(
    { id: this._id, role: this.role, company: this.company },
    process.env.REFRESH_TOKEN || "",
    { expiresIn: "7d" }
  );
};

UserSchema.methods.comparePassword = async function (
  enteredPassword: string
): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model<IUser>("User", UserSchema);
