import { Hono } from "hono";
import validateRequest from "../../middlewares/validateRequest";
import {
  forgotPasswordController,
  loginController,
  loginWithoutOtpController,
  registerController,
  resetPasswordController,
  verifyEmailOtpController,
} from "./auth.controller";
import { authValidation } from "./auth.validation";
import {
  facebookAuthCallback,
  facebookAuthRedirect,
  googleAuthCallback,
  googleAuthRedirect,
} from "./passport";

const authRouter = new Hono();

authRouter.post(
  "/register",
  validateRequest(authValidation.registerSchema),
  registerController
);

authRouter.post(
  "/verify-email-otp",
  validateRequest(authValidation.verifyEmailOtpSchema),
  verifyEmailOtpController
);

authRouter.post(
  "/login",
  validateRequest(authValidation.loginSchema),
  loginController
);

authRouter.post(
  "/login-without-otp",
  validateRequest(authValidation.loginSchema),
  loginWithoutOtpController
);

authRouter.post(
  "/forgot-password",
  validateRequest(authValidation.forgotPasswordSchema),
  forgotPasswordController
);

authRouter.post(
  "/reset-password",
  validateRequest(authValidation.resetPasswordSchema),
  resetPasswordController
);

authRouter.get("/social-login/google", googleAuthRedirect);
authRouter.get("/social-login/google/callback", googleAuthCallback);

authRouter.get("/social-login/facebook", facebookAuthRedirect);
authRouter.get("/social-login/facebook/callback", facebookAuthCallback);

export default authRouter;
