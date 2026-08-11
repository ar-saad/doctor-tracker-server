import { Schema, model } from "mongoose";

export interface IDoctor {
  name: string;
  specialization: string;
  hospital: string;
  phone: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

const doctorSchema = new Schema<IDoctor>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    specialization: {
      type: String,
      required: [true, "Specialization is required"],
      trim: true,
    },
    hospital: {
      type: String,
      required: [true, "Hospital is required"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
  },
  { timestamps: true },
);

// No text index: Phase 3 search is case-insensitive regex for partial matches,
// which $text cannot do (it matches whole stemmed words only).
doctorSchema.index({ specialization: 1 });
doctorSchema.index({ hospital: 1 });
doctorSchema.index({ createdAt: -1 });

export const Doctor = model<IDoctor>("Doctor", doctorSchema);
