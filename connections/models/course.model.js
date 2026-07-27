// course.model.js
import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  imageurl: {
    secure_url: String,
    public_id: String
  },
  schedules: [{
    day: {
      type: String,
      required: true,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    },
    time: {
      type: String,
      required: true
    }
  }]
}, {
  timestamps: true
});

courseSchema.index(
  { title: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

export const courseModel = mongoose.model('Course', courseSchema); // ✅ تأكد الاسم هو "Course"
