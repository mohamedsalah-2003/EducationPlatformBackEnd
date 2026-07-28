import mongoose from 'mongoose';

const submittedAssignmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Leason',
      required: true
    },
    file: {
      url: String,
      public_id: String,
      filePath: String
    },

    rating: {
      type: Number,
      min: 0,
      max: 5
    },
    feedback: String,
    submittedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'graded', 'returned'],
      default: 'pending'
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

submittedAssignmentSchema.index({ userId: 1, lessonId: 1 }, { unique: true });
submittedAssignmentSchema.index({ userId: 1, submittedAt: -1, _id: -1 });
submittedAssignmentSchema.index({ lessonId: 1, submittedAt: -1, _id: -1 });

export const submittedAssignmentModel = mongoose.model('SubmittedAssignment', submittedAssignmentSchema);
