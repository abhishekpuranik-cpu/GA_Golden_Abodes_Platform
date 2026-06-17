import { Router } from 'express';
import CHSFormation from '../../models/postsales/CHSFormation.js';
import { PROJECTS } from '../../lib/postsales/steps.js';

const CHS_DOCUMENTS = [
  'Application for registration of society',
  'List of promoters / members',
  'Bye-laws of the society (draft)',
  'Affidavit of chief promoter',
  'Affidavit regarding ownership of land',
  'Certificate of architect on construction',
  'Certificate of engineer on construction',
  'NOC from fire department',
  'NOC from pollution control board',
  'Property card / 7/12 extract',
  'Development agreement copy',
  'Approved building plans',
  'Commencement certificate',
  'Occupancy certificate',
  'List of flat owners with area schedule',
  'Consent letters from flat owners',
  'Bank account opening resolution (draft)',
  'PAN application documents',
  'Registration fee payment challan',
];

const router = Router();

router.get('/', async (req, res) => {
  try {
    const project = req.query.project;
    if (!project) return res.status(400).json({ error: 'project required' });
    let record = await CHSFormation.findOne({ project }).lean();
    if (!record) {
      const proj = PROJECTS.find((p) => p.name === project);
      record = await CHSFormation.create({
        project,
        entity: proj?.entity,
        documentChecklist: CHS_DOCUMENTS.map((document, i) => ({
          srNo: i + 1,
          document,
          status: 'pending',
        })),
      });
    }
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { project, ...data } = req.body;
    if (!project) return res.status(400).json({ error: 'project required' });

    let existing = await CHSFormation.findOne({ project });
    if (!existing) {
      const proj = PROJECTS.find((p) => p.name === project);
      existing = new CHSFormation({
        project,
        entity: proj?.entity,
        documentChecklist: CHS_DOCUMENTS.map((document, i) => ({
          srNo: i + 1,
          document,
          status: 'pending',
        })),
      });
    }

    Object.assign(existing, data);
    if (!existing.documentChecklist?.length) {
      existing.documentChecklist = CHS_DOCUMENTS.map((document, i) => ({
        srNo: i + 1,
        document,
        status: 'pending',
      }));
    }
    await existing.save();
    res.json(existing);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
