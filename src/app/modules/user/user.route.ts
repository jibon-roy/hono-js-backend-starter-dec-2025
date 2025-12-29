import { Hono } from "hono";
import validateRequest from "../../middlewares/validateRequest";
import {
  deleteUserController,
  getAllUsersController,
  getUserByIdController,
  updateUserController,
  updateUserEmailController,
  updateUserPasswordController,
} from "./user.controller";
import { userValidation } from "./user.validation";

const userRouter = new Hono();

//  get all user
userRouter.get("/all", getAllUsersController);

// get user by id
userRouter.get(
  "/:id",
  validateRequest(userValidation.getUserByIdSchema),
  getUserByIdController
);

// update user by id
userRouter.put(
  "/:id",
  validateRequest(userValidation.updateUserSchema),
  updateUserController
);

// delete user by id
userRouter.delete(
  "/:id",
  validateRequest(userValidation.deleteUserSchema),
  deleteUserController
);

// update user password
userRouter.patch(
  "/:id/password",
  validateRequest(userValidation.updateUserPasswordSchema),
  updateUserPasswordController
);

// update user email
userRouter.patch(
  "/:id/email",
  validateRequest(userValidation.updateUserEmailSchema),
  updateUserEmailController
);

export default userRouter;
