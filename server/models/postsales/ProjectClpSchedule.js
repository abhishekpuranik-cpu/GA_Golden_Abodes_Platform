import mongoose from 'mongoose';

const ClpScheduleRowSchema = new mongoose.Schema({
  milestone: { type: String, required: true },
  percentDue: { type: Number, default: 0 },
  constructionLinked: { type: Boolean, default: true },
  targetDate: Date,
  achievedDate: Date,
  scheduleOrder: { type: Number, default: 0 },
}, { _id: true });

const ProjectClpScheduleSchema = new mongoose.Schema({
  project: { type: String, required: true, unique: true },
  rows: { type: [ClpScheduleRowSchema], default: [] },
  updatedBy: String,
}, { timestamps: true });

export default mongoose.models.ProjectClpSchedule
  || mongoose.model('ProjectClpSchedule', ProjectClpScheduleSchema);
