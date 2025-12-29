import { addMinutes } from "date-fns";

// How long an OTP is valid (in minutes)
export const OTP_EXPIRE_DURATION_MINUTES = 5;

/**
 * Returns the expiry time for a new OTP
 */
export const getOtpExpiryDate = (): Date => {
  return addMinutes(new Date(), OTP_EXPIRE_DURATION_MINUTES);
};

export const paginationFields = ["page", "limit", "sortBy", "sortOrder"];
