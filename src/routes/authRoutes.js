
import express from "express";

import {
    login,
    logout,
    me,
    register,
    updateMe,
    updateAvatar,
    changePassword,
    getAvatar,
} from "../controllers/authController.js";

import { requireAuth } from "../middleware/authMiddleware.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import asyncHandler from "../utils/asyncHandler.js";
import { uploadAvatar } from "../middleware/upload.js";

const router = express.Router();

// Apply the authentication rate limiter to public authentication
// endpoints that are vulnerable to repeated login/registration attempts.
router.post("/register", authLimiter, asyncHandler(register));
router.post("/login", authLimiter, asyncHandler(login));

// Logout
router.post("/logout", asyncHandler(logout));

// Protected endpoints
router.get("/avatar/:filename", requireAuth, asyncHandler(getAvatar));
router.get("/me", requireAuth, asyncHandler(me));
router.put("/me", requireAuth, asyncHandler(updateMe));
router.put(
    "/avatar",
    requireAuth,
    uploadAvatar,
    asyncHandler(updateAvatar),
);
router.put(
    "/password",
    requireAuth,
    asyncHandler(changePassword),
);

export default router;
