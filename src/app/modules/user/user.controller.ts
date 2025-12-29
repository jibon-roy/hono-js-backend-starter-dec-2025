import type { Context } from "hono";
import sendResponse from "../../../shared/sendResponse";
import {
  createUserService,
  deleteUserByIdService,
  getAllUsersService,
  getUserByIdService,
  updateUserByIdService,
  updateUserEmailService,
  updateUserPasswordService,
} from "./user.service";

// get all user controller
const getAllUsersController = async (c: Context) => {
  const result = await getAllUsersService();

  return sendResponse(c, {
    statusCode: 200,
    success: true,
    message: "Users retrieved successfully",
    data: result,
  });
};

// create user controller
const createUserController = async (c: Context) => {
  const body = await c.req.json();
  const result = await createUserService(body);

  return sendResponse(c, {
    statusCode: 201,
    success: true,
    message: "User created successfully",
    data: result,
  });
};

const getUserByIdController = async (c: Context) => {
  const { id } = c.req.param();
  const result = await getUserByIdService(id);

  return sendResponse(c, {
    statusCode: 200,
    success: true,
    message: "User retrieved successfully",
    data: result,
  });
};

const updateUserController = async (c: Context) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const result = await updateUserByIdService(id, body);

  return sendResponse(c, {
    statusCode: 200,
    success: true,
    message: "User updated successfully",
    data: result,
  });
};

const deleteUserController = async (c: Context) => {
  const { id } = c.req.param();
  const result = await deleteUserByIdService(id);

  return sendResponse(c, {
    statusCode: 200,
    success: true,
    message: "User deleted successfully",
    data: result,
  });
};

const updateUserPasswordController = async (c: Context) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const result = await updateUserPasswordService(id, body.password);

  return sendResponse(c, {
    statusCode: 200,
    success: true,
    message: "Password updated successfully",
    data: result,
  });
};

const updateUserEmailController = async (c: Context) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const result = await updateUserEmailService(id, body.email);

  return sendResponse(c, {
    statusCode: 200,
    success: true,
    message: "Email updated successfully",
    data: result,
  });
};

export {
  getAllUsersController,
  createUserController,
  getUserByIdController,
  updateUserController,
  deleteUserController,
  updateUserPasswordController,
  updateUserEmailController,
};
