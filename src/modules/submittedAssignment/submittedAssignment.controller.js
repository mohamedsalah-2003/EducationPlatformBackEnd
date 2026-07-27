import { submittedAssignmentModel } from '../../../connections/models/submittedAssignment.model.js';
import { asyncHandler } from '../../utils/errorHandeling.js';
import { leasonModel } from '../../../connections/models/leason.model.js';
import fs from 'fs';
import path from 'path';
import cloudinary from '../../utils/cloudinaryConfigration.js';
import axios from 'axios';
import { getManagedCourseIds } from '../../middelwares/courseAccess.js';
import { findStudentAssignmentFeedback } from '../../services/studentFeedback.js';
import https from 'https'; // ضروري علشان نعمل request للملف من Cloudinary




// Download a submission (for students to download their own submission)

export const downloadMySubmission = asyncHandler(async (req, res, next) => {
  const { submissionId } = req.params;
  const userId = req.authuser._id;

  const submission = await submittedAssignmentModel.findOne({ _id: submissionId, userId });
  if (!submission || !submission.file || !submission.file.url) {
    return res.status(404).json({ message: 'Submission not found or unauthorized' });
  }

  const fileUrl = submission.file.url;

  // طلب مباشر للملف من Cloudinary
  https.get(fileUrl, (fileRes) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=submission.pdf');
    fileRes.pipe(res);
  }).on('error', (err) => {
    console.error('File download error:', err);
    res.status(500).json({ message: 'Failed to download file.' });
  });
});

// Create a submission
export const createSubmission = asyncHandler(async (req, res, next) => {
    try {
      const { lessonId } = req.params;
      const userId = req.authuser._id;
  
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized: User ID not found" });
      }
  
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const lesson = req.lesson || await leasonModel.findById(lessonId);
      if (!lesson) {
        return res.status(404).json({ message: "Lesson not found" });
      }

      if (!lesson.assignment?.filePath) {
        return res.status(400).json({ message: "This lesson has no assignment" });
      }

      if (lesson.assignment.dueDate && new Date() > lesson.assignment.dueDate) {
        return res.status(400).json({ message: "Assignment deadline has passed" });
      }

      const existingSubmission = await submittedAssignmentModel.exists({
        userId,
        lessonId,
      });

      if (existingSubmission) {
        return res.status(409).json({
          message: "You have already submitted this assignment",
          code: "ASSIGNMENT_ALREADY_SUBMITTED",
        });
      }
  
      // Upload file to Cloudinary
      let cloudinaryResult;
      try {
        cloudinaryResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              resource_type: "raw",
              folder: "assignmentSubmissions",
              format: "pdf"
            },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );
          uploadStream.end(req.file.buffer);
        });
      } catch (err) {
        return res.status(500).json({ message: "Cloudinary upload error", error: err.message });
      }
  
      const submission = await submittedAssignmentModel.create({
        lessonId,
        userId,
        file: { url: cloudinaryResult.secure_url, public_id: cloudinaryResult.public_id },
        submittedAt: new Date()
      });
  
      // Add this block to update the lesson's submissions array
      await leasonModel.findByIdAndUpdate(lessonId, {
        $addToSet: { submissions: submission._id },
      });
  
      res.status(201).json({ message: 'Submission created successfully', submission });
    } catch (error) {
      console.error('Error creating submission:', error);
      if (error?.code === 11000) {
        return res.status(409).json({
          message: 'You have already submitted this assignment',
          code: 'ASSIGNMENT_ALREADY_SUBMITTED',
        });
      }
      res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
  });


// Review all submissions (admin and instructor only)
export const reviewAllSubmissions = asyncHandler(async (req, res, next) => {
  const { role } = req.authuser;

  if (role !== 'Admin' && role !== 'Instructor') {
    return res.status(403).json({ message: 'Unauthorized: Admin or Instructor access required' });
  }

  const submissionFilter = {};

  if (role === 'Instructor') {
    const courseIds = await getManagedCourseIds(req.authuser);
    const lessonIds = await leasonModel.distinct('_id', {
      courseId: { $in: courseIds },
    });
    submissionFilter.lessonId = { $in: lessonIds };
  }

  const submissions = await submittedAssignmentModel.find(submissionFilter)
    .populate({
      path: 'userId',
      select: 'username email'
    })
    .populate({
      path: 'reviewerId',
      select: 'username email'
    })
    .populate({
      path: 'lessonId',
      select: 'title description courseId',
      populate: {
        path: 'courseId',
        select: 'title   imageurl'
      }
    });

  res.status(200).json({
    submissions: submissions.map(sub => ({
      ...sub.toObject(),
      reviewerName: sub.reviewerId?.username || null,
      reviewerEmail: sub.reviewerId?.email || null
    }))
  });
});

// Grade a submission (admin and instructor only)
export const gradeSubmission = asyncHandler(async (req, res, next) => {
  const { submissionId } = req.params;
  const { rating, feedback } = req.body;
  const { role, _id } = req.authuser;

  if (role !== 'Admin' && role !== 'Instructor') {
    return res.status(403).json({ message: 'Unauthorized: Admin or Instructor access required' });
  }

  if (rating < 0 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 0 and 5' });
  }

  const submission = await submittedAssignmentModel.findOneAndUpdate(
    { _id: submissionId, status: { $ne: 'graded' } },
    {
      $set: {
        rating,
        feedback: feedback || '',
        status: 'graded',
        reviewerId: _id,
      },
    },
    { new: true, runValidators: true }
  );

  if (!submission) {
    const exists = await submittedAssignmentModel.exists({ _id: submissionId });
    return res.status(exists ? 409 : 404).json({
      message: exists ? 'This submission has already been graded' : 'Submission not found',
      code: exists ? 'SUBMISSION_ALREADY_GRADED' : 'SUBMISSION_NOT_FOUND',
    });
  }

  // Get the updated submission with populated fields
  const updatedSubmission = await submittedAssignmentModel.findById(submissionId)
    .populate({
      path: 'userId',
      select: 'username email'
    })
    .populate({
      path: 'reviewerId',
      select: 'username email'
    })
    .populate({
      path: 'lessonId',
      select: 'title description courseId',
      populate: {
        path: 'courseId',
        select: 'title imageurl'
      }
    });

  res.status(200).json({ 
    message: 'Submission graded successfully', 
    submission: updatedSubmission,
    reviewerName: updatedSubmission.reviewerId?.username || null,
    reviewerEmail: updatedSubmission.reviewerId?.email || null
  });
});


// Download a submission (for admin and instructor to download any submission)

export const downloadSubmission = asyncHandler(async (req, res) => {
  const { submissionId } = req.params;

  const submission = await submittedAssignmentModel.findById(submissionId);
  if (!submission || !submission.file?.url) {
    return res.status(404).json({ message: 'Submission not found' });
  }

  const cloudinaryUrl = submission.file.url;

  try {
    const response = await axios({
      method: 'GET',
      url: cloudinaryUrl,
      responseType: 'arraybuffer', // ← مهم جداً علشان تبني blob من الـ buffer
      maxRedirects: 5,
    });

    const contentType = response.headers['content-type'] || 'application/pdf';
    const contentLength = response.headers['content-length'] || undefined;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'attachment; filename="submission.pdf"');

    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    res.status(200).send(response.data); // ← رجّع الـ buffer مباشرة
  } catch (error) {
    console.error('Failed to download file:', error.message);
    res.status(500).json({ message: 'Error downloading file', error: error.message });
  }
});

export const getStudentAssignmentSubmissions = async (req, res) => {
  try {
    // Find all assignment submissions for this student with proper population
    const submissions = await findStudentAssignmentFeedback({
      authUser: req.authuser,
    });

    if (!submissions || submissions.length === 0) {
      return res.status(404).json({
        message: 'No assignment submissions found'
      });
    }

    // Return all submissions with their details
    return res.status(200).json({
      message: 'Assignment submissions retrieved successfully',
      submissions: submissions.map(submission => {
        const submissionData = {
          id: submission._id,
          lessonTitle: submission.lessonId?.title || 'Unknown Lesson',
          courseName: submission.lessonId?.courseId?.title || 'Unknown Course',
          courseId: submission.lessonId?.courseId?._id || null,
          submittedAt: submission.submittedAt,
          status: submission.status || 'pending',
          reviewerName: submission.reviewerId?.username || null,
          reviewerEmail: submission.reviewerId?.email || null
        };

        // Only include mark, rating and feedback if the submission is graded
        if (submission.status === 'graded') {
          submissionData.rating = submission.rating ?? 'No Rating';
          submissionData.feedback = submission.feedback || 'No feedback provided';
        } else {
     
          submissionData.rating = null;
          submissionData.feedback = null;
        }

        return submissionData;
      })
    });
  } catch (error) {
    console.error('Error getting assignment submissions:', error);
    return res.status(500).json({
      message: 'Error getting assignment submissions',
      error: error.message
    });
  }
};
