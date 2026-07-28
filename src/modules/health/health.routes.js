import { Router } from 'express';
import { liveness, metrics, readiness } from './health.controller.js';

const router = Router();

router.get('/live', liveness);
router.get('/ready', readiness);
router.get('/metrics', metrics);

export default router;
