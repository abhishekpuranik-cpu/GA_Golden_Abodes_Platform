import { Router } from 'express';
import TravelTrip from '../../../models/adminServices/travel/Trip.js';
import TravelClaim from '../../../models/adminServices/travel/Claim.js';
import TravelDistance from '../../../models/adminServices/travel/Distance.js';
import TravelLocation from '../../../models/adminServices/travel/Location.js';
import { canSettle, canApprove, canTravelAdmin, requirePerm } from '../../../lib/adminServices/access.js';
import { notDeletedFilter } from '../../../lib/adminServices/mongoose.js';
import { toCsv, sendCsv } from '../../../lib/adminServices/exportCsv.js';

const router = Router();

router.get('/summary', async (req, res) => {
  try {
    const filter = notDeletedFilter();
    if (req.query.entityTag) filter.entityTag = req.query.entityTag;
    if (req.query.period) filter.claimPeriod = req.query.period;
    const claims = await TravelClaim.find(filter).lean();
    const byEmp = {};
    for (const c of claims) {
      const k = String(c.employeeId);
      if (!byEmp[k]) {
        byEmp[k] = {
          employeeId: k,
          claims: 0,
          grandTotalPaise: 0,
          totalDistanceMetres: 0
        };
      }
      byEmp[k].claims += 1;
      byEmp[k].grandTotalPaise += c.grandTotalPaise || 0;
      byEmp[k].totalDistanceMetres += c.totalDistanceMetres || 0;
    }
    res.json({ summary: Object.values(byEmp) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export/payroll', requirePerm((u) => canSettle(u) || canApprove(u), 'SETTLE required'), async (req, res) => {
  try {
    const filter = notDeletedFilter({ status: 'APPROVED' });
    if (req.query.period) filter.claimPeriod = req.query.period;
    const claims = await TravelClaim.find(filter).lean();
    const headers = ['employeeId', 'claimPeriod', 'entityTag', 'grandTotalPaise', 'totalDistanceMetres', 'tripCount'];
    const csv = toCsv(headers, claims, { headerKeys: headers });
    sendCsv(res, `travel-payroll-${req.query.period || 'all'}.csv`, csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export/detail', requirePerm((u) => canSettle(u) || canApprove(u) || canTravelAdmin(u), 'export permission required'), async (req, res) => {
  try {
    const filter = notDeletedFilter();
    if (req.query.period) {
      const [y, m] = String(req.query.period).split('-').map(Number);
      filter.travelDate = {
        $gte: new Date(Date.UTC(y, m - 1, 1)),
        $lt: new Date(Date.UTC(y, m, 1))
      };
    }
    const trips = await TravelTrip.find(filter).lean();
    const headers = [
      'tripId', 'employeeId', 'entityTag', 'travelDate', 'status', 'vehicleType',
      'computedDistanceMetres', 'claimedDistanceMetres', 'ratePerKmPaise',
      'fuelAmountPaise', 'ancillaryTotalPaise', 'totalClaimPaise', 'distanceBasis', 'exceptionFlags'
    ];
    const rows = trips.map((t) => ({
      tripId: String(t._id),
      employeeId: String(t.employeeId),
      entityTag: t.entityTag,
      travelDate: t.travelDate?.toISOString?.()?.slice(0, 10) || '',
      status: t.status,
      vehicleType: t.vehicleType,
      computedDistanceMetres: t.computedDistanceMetres,
      claimedDistanceMetres: t.claimedDistanceMetres,
      ratePerKmPaise: t.ratePerKmPaise,
      fuelAmountPaise: t.fuelAmountPaise,
      ancillaryTotalPaise: t.ancillaryTotalPaise,
      totalClaimPaise: t.totalClaimPaise,
      distanceBasis: t.distanceBasis,
      exceptionFlags: (t.exceptionFlags || []).join('|')
    }));
    const csv = toCsv(headers, rows, { headerKeys: headers });
    sendCsv(res, `travel-detail-${req.query.period || 'all'}.csv`, csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/matrix-health', requirePerm((u) => canApprove(u) || canTravelAdmin(u), 'ADMIN or APPROVE required'), async (req, res) => {
  try {
    const total = await TravelDistance.countDocuments(notDeletedFilter());
    const verified = await TravelDistance.countDocuments(notDeletedFilter({ isVerified: true }));
    const unverified = await TravelDistance.find(notDeletedFilter({ isVerified: false }))
      .sort({ claimCount: -1 })
      .limit(50)
      .lean();
    const locIds = [...new Set(unverified.flatMap((r) => [String(r.locationAId), String(r.locationBId)]))];
    const locs = await TravelLocation.find({ _id: { $in: locIds } }).lean();
    const byId = Object.fromEntries(locs.map((l) => [String(l._id), l.name]));
    res.json({
      total,
      verified,
      verifiedPercent: total ? Math.round((verified / total) * 10000) / 100 : 0,
      unverifiedByUsage: unverified.map((u) => ({
        ...u,
        fromName: byId[String(u.locationAId)],
        toName: byId[String(u.locationBId)]
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
