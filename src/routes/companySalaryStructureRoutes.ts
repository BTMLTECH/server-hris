import express from "express";
import {
  createOrUpdateCompanySalary,
  updateCompanySalaryStructure,
  getCompanySalary,
} from "../controllers/companySalaryStructureController";
import { protect, allowAdminAndHR } from "../middleware/auth.middleware";
import { tenantAuth } from "../middleware/tenantAuth";

const router = express.Router();

// Create or update company salary structure
router.post("/", protect, tenantAuth, allowAdminAndHR, createOrUpdateCompanySalary);

// Update a specific salary structure
router.put("/:id", protect, tenantAuth, allowAdminAndHR, updateCompanySalaryStructure);

// Get company salary structure
router.get("/:companyId", protect, tenantAuth, allowAdminAndHR, getCompanySalary);

export default router;
