import type { Context } from "hono";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import {
  forgotPasswordService,
  loginService,
  loginWithoutOtpService,
  registerService,
  resetPasswordService,
  verifyEmailOtpService,
} from "./auth.service";

export const registerController = catchAsync(async (c: Context) => {
  const body = await c.req.json();
  const result = await registerService(body);
  return sendResponse(c, {
    statusCode: 201,
    success: true,
    message: "OTP sent to email. Please verify to complete registration",
    data: result,
  });
});

export const verifyEmailOtpController = catchAsync(async (c: Context) => {
  const body = await c.req.json();
  const result = await verifyEmailOtpService(body);
  return sendResponse(c, {
    statusCode: 200,
    success: true,
    message: "Email verified successfully",
    data: result,
  });
});

export const loginController = catchAsync(async (c: Context) => {
  const body = await c.req.json();

  // Fill device metadata from headers when not provided.
  if (!body.deviceId) {
    body.deviceId = c.req.header("x-device-id") ?? undefined;
  }
  if (!body.userAgent) {
    body.userAgent = c.req.header("user-agent") ?? undefined;
  }
  if (!body.ipAddress) {
    body.ipAddress = c.req.header("x-forwarded-for") ?? undefined;
  }

  const result = await loginService(body);
  return sendResponse(c, {
    statusCode: 200,
    success: true,
    message: "Login successful",
    data: result,
  });
});

export const loginWithoutOtpController = catchAsync(async (c: Context) => {
  const body = await c.req.json();

  // Fill device metadata from headers when not provided.
  if (!body.deviceId) {
    body.deviceId = c.req.header("x-device-id") ?? undefined;
  }
  if (!body.userAgent) {
    body.userAgent = c.req.header("user-agent") ?? undefined;
  }
  if (!body.ipAddress) {
    body.ipAddress = c.req.header("x-forwarded-for") ?? undefined;
  }

  const result = await loginWithoutOtpService(body);
  return sendResponse(c, {
    statusCode: 200,
    success: true,
    message: "Login successful",
    data: result,
  });
});

export const forgotPasswordController = catchAsync(async (c: Context) => {
  const body = await c.req.json();
  const result = await forgotPasswordService(body);
  return sendResponse(c, {
    statusCode: 200,
    success: true,
    message: "If the email exists, an OTP has been sent",
    data: result,
  });
});

export const resetPasswordController = catchAsync(async (c: Context) => {
  const body = await c.req.json();
  const result = await resetPasswordService(body);
  return sendResponse(c, {
    statusCode: 200,
    success: true,
    message: "Password reset successfully",
    data: result,
  });
});
