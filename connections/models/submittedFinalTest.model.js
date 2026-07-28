import mongoose from 'mongoose';

const submittedFinalTestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    finalTestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FinalTest',
      required: true
    },
    file: {
      url: String,         // Cloudinary URL
      public_id: String    // Cloudinary public_id
    },
    rating: {
      type: Number,
      min: 0,
      max: 5
    },
    feedback: String,
    status: {
      type: String,
      enum: ['pending', 'graded', 'returned'],
      default: 'pending'
    },
    submittedAt: {
      type: Date,
      default: Date.now
    },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

// Add a compound index to ensure a student can only submit once per final test
submittedFinalTestSchema.index({ userId: 1, finalTestId: 1 }, { unique: true });
submittedFinalTestSchema.index({ userId: 1, submittedAt: -1, _id: -1 });
submittedFinalTestSchema.index({ finalTestId: 1, submittedAt: -1, _id: -1 });

export const submittedFinalTestModel = mongoose.model('SubmittedFinalTest', submittedFinalTestSchema);
