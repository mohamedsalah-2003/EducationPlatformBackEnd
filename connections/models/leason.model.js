import mongoose from 'mongoose';

const leasonSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true
    },
    video: {
      secure_url: String,
      public_id: String,
      duration: Number,
      format: String
    },
    assignment: {
      url: String,
      public_id: String,
      title: String,
      description: String,
      dueDate: Date,
      filePath:String
    },
    submissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SubmittedAssignment' }]
  },
  {
    timestamps: true
  }
);

leasonSchema.index(
  { courseId: 1, title: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

export const leasonModel = mongoose.model('Leason', leasonSchema);
