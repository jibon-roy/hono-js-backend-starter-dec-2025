import { UserRole } from "@prisma/client";
import prisma from "../../shared/prisma";
import bcrypt from "bcryptjs";

export const initiateAdmin = async () => {
  const payload = {
    userName: "brenda speace",
    firstName: "brenda",
    lastName: "speace",
    email: "brendaspeace123@gmail.com",
    password: "123456",
    role: "ADMIN",
  };

  const existingAdmin = await prisma.userAuth.findUnique({
    where: { email: payload.email },
  });

  if (existingAdmin) {
    return;
  }

  await prisma.$transaction(async (TransactionClient) => {
    const hashedPassword: string = await bcrypt.hash(payload.password, 12);
    await TransactionClient.userAuth.create({
      data: {
        userDetails: {
          create: {
            // userName: payload.userName,
            firstName: payload.firstName,
            lastName: payload.lastName,
          },
        },
        email: payload.email,
        password: hashedPassword,
        role: payload.role as UserRole,
      },
    });
  });
};
