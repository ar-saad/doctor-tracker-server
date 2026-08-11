import { Schema, model, type Types } from "mongoose";

export const GENDERS = ["male", "female", "other"] as const;
export type Gender = (typeof GENDERS)[number];

export interface IPatient {
  name: string;
  age: number;
  gender: Gender;
  phone: string;
  condition: string;
  doctor: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const patientSchema = new Schema<IPatient>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    age: {
      type: Number,
      required: [true, "Age is required"],
      min: [0, "Age cannot be negative"],
      max: [130, "Age must be realistic"],
    },
    gender: {
      type: String,
      required: [true, "Gender is required"],
      enum: {
        values: GENDERS,
        message: "Gender must be one of: male, female, other",
      },
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      trim: true,
    },
    condition: {
      type: String,
      required: [true, "Condition is required"],
      trim: true,
    },
    doctor: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
      required: [true, "Doctor is required"],
      index: true,
    },
  },
  { timestamps: true },
);

patientSchema.index({ condition: 1 });
patientSchema.index({ createdAt: -1 });

export const Patient = model<IPatient>("Patient", patientSchema);
