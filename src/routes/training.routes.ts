const express = require('express');
const { protect, allowAllRoles } = require('../middleware/auth.middleware');
const { tenantAuth } = require('../middleware/tenantAuth');
const {
  createTraining,
  submitFeedback,
  getAllTrainings,
} = require('../controllers/trainingController');

const router = express.Router();

// Create training (team lead only)
router.post('/create', protect, tenantAuth, allowAllRoles, createTraining);

// Submit feedback (employees only)
router.post('/:id', protect, tenantAuth, allowAllRoles, submitFeedback);

// Get all trainings (all roles)
router.get('/get-all', protect, tenantAuth, allowAllRoles, getAllTrainings);

export default router;
