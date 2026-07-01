import mongoose from 'mongoose';



const ChecklistItemSchema = new mongoose.Schema({

  item: String,

  done: { type: Boolean, default: false },

  doneAt: Date,

  doneBy: String,

});



const ActivityLogSchema = new mongoose.Schema({

  action: {

    type: String,

    enum: ['created', 'assigned', 'started', 'checklist', 'completed', 'reopened', 'note', 'status_changed', 'delayed', 'document_uploaded'],

    required: true,

  },

  at: { type: Date, default: Date.now },

  by: String,

  detail: String,

}, { _id: false });



const ClpLetterTaskSchema = new mongoose.Schema({

  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },

  demandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Demand' },

  milestoneKey: { type: String },

  milestoneName: String,

  clpPercent: Number,

  scheduleOrder: { type: Number, default: 0 },

  achievedDate: Date,

  assignee: String,

  status: { type: String, enum: ['open', 'in_progress', 'complete', 'delayed'], default: 'open' },

  dueDate: Date,

  revisedDate: Date,

  triggeredBy: String,

  checklist: [ChecklistItemSchema],

  activityLog: [ActivityLogSchema],

  completedAt: Date,

  completedBy: String,

  note: String,

}, { timestamps: true });



ClpLetterTaskSchema.index({ unitId: 1, status: 1 });

ClpLetterTaskSchema.index({ unitId: 1, milestoneKey: 1 }, { unique: true });

ClpLetterTaskSchema.index({ demandId: 1 }, { unique: true, sparse: true });

ClpLetterTaskSchema.index({ assignee: 1, status: 1 });



export default mongoose.models.ClpLetterTask

  || mongoose.model('ClpLetterTask', ClpLetterTaskSchema);

