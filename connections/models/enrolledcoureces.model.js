import mongoose from 'mongoose';

const enrolledCoursesSchema = new mongoose.Schema(
  {
    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    courses: [{
      courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
      },
      selectedSchedule: {
        day: {
          type: String,
          required: true,
          enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        },
        time: {
          type: String,
          required: true
        }
      }
    }]
  },
  { timestamps: true }
);

enrolledCoursesSchema.index({ userid: 1, 'courses.courseId': 1 });

export const enrolledCoursesModel = mongoose.model('EnrolledCourses', enrolledCoursesSchema);
