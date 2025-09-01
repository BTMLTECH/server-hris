"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const const_1 = require("../constant/const");
const UserSchema = new mongoose_1.Schema({
    staffId: { type: String, required: true, unique: true },
    title: { type: String, enum: ["Mr", "Mrs", "Ms", "Dr", "Prof"], required: true },
    firstName: { type: String, required: true, trim: true },
    middleName: { type: String, trim: true },
    lastName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["male", "female"], required: true },
    dateOfBirth: Date,
    stateOfOrigin: { type: String, enum: const_1.NIGERIAN_STATES },
    address: String,
    city: String,
    mobile: String,
    // biometryId: String , 
    profileImage: String,
    nextOfKin: {
        name: String,
        phone: String,
        email: String,
        relationship: String,
    },
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    department: {
        type: String,
        enum: [
            'it', 'account', 'hr', 'channel', 'retail', 'operation', 'operationsbu',
            'corporate', 'marketing', 'md', 'teamlead', 'employee',
            'admin', 'rgogh', 'roaghi'
        ],
        required: true
    },
    position: String,
    level: String,
    officeBranch: {
        type: String,
        enum: ["Head Office", "Shell SBU"],
        required: false
    },
    employmentDate: Date,
    accountInfo: {
        classLevel: String,
        basicPay: Number,
        allowances: Number,
        bankAccountNumber: String,
        bankName: { type: String, enum: const_1.NIGERIAN_BANKS },
        taxNumber: String,
        pensionCompany: { type: String, enum: const_1.PFA_COMPANIES },
        pensionNumber: String,
    },
    role: { type: String, enum: ['employee', 'md', 'teamlead', 'admin', 'hr'], default: 'employee' },
    company: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true },
    status: { type: String, enum: ['active', 'inactive', 'terminated'], default: 'active', required: true },
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
        lastContributionDate: Date
    },
    twoFactorCode: String,
    twoFactorExpiry: Date,
    resetToken: String,
    resetTokenExpiry: Date,
    createdAt: { type: Date, default: Date.now },
});
UserSchema.set("toJSON", { virtuals: true });
UserSchema.set("toObject", { virtuals: true });
UserSchema.virtual("requirements", {
    ref: "OnboardingRequirement",
    localField: "_id",
    foreignField: "employee",
});
UserSchema.pre('save', function (next) {
    if (this.status === 'terminated' && !this.terminationDate) {
        this.terminationDate = new Date();
    }
    next();
});
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password'))
        return next();
    const salt = await bcryptjs_1.default.genSalt(10);
    this.password = await bcryptjs_1.default.hash(this.password, salt);
    next();
});
// Sign access token
UserSchema.methods.SignAccessToken = function () {
    return jsonwebtoken_1.default.sign({ id: this._id, role: this.role, company: this.company }, process.env.ACCESS_TOKEN || "", {
        expiresIn: "1d",
        // expiresIn: "1m",
    });
};
// Sign refresh token
UserSchema.methods.SignRefreshToken = function () {
    return jsonwebtoken_1.default.sign({ id: this._id, role: this.role, company: this.company }, process.env.REFRESH_TOKEN || "", {
        expiresIn: "7d",
    });
};
// Compare entered password with stored hash
UserSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcryptjs_1.default.compare(enteredPassword, this.password);
};
exports.default = mongoose_1.default.model('User', UserSchema);
