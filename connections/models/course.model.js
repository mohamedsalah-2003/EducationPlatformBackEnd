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
  }],
  lessons: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Leason'
    }
  ],
  finalTest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinalTest',
    
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual populate for schedules
courseSchema.virtual('scheduleRefs', {
  ref: 'Schedule',
  localField: '_id',
  foreignField: 'courseId'
});

export const courseModel = mongoose.model('Course', courseSchema); // ✅ تأكد الاسم هو "Course"
