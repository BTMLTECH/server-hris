import mongoose, { Schema, Document } from 'mongoose';

export interface IOnboardingRequirement extends Document {
  employee?: mongoose.Types.ObjectId | string; 
  department: string;
  tasks: {
    name: string;
    category: 'training' | 'services' | 'device';
    completed: boolean;
    completedAt?: Date;
  }[];
  createdAt: Date;
}

const OnboardingRequirementSchema = new Schema<IOnboardingRequirement>({
  employee: { type: Schema.Types.ObjectId, ref: 'User', required: false }, 
  department: { type: String, required: true },
  tasks: [
    {
      name: { type: String, required: true },
      category: { type: String, enum: ['training', 'services', 'device'], required: true },
      completed: { type: Boolean, default: false },
      completedAt: Date,
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

export const OnboardingRequirement = mongoose.model<IOnboardingRequirement>(
  'OnboardingRequirement',
  OnboardingRequirementSchema
);
