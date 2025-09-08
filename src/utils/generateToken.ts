import { NextFunction, Request, Response } from "express";
import User, { IUser } from "../models/user.model";
import { redisClient } from "./redisClient";
import { AuthData } from "../types/auth";
import { TypedResponse } from "../types/typedResponse";
import ErrorResponse from "./ErrorResponse";
require("dotenv").config();


interface ITokenOptions {
  expires: Date;
  maxAge: number;
  httpOnly: boolean;
  sameSite: "lax" | "strict" | "none" | undefined;
  secure?: boolean;
}

const isProd = process.env.NODE_ENV === 'production';
const accessTokenExpire = parseInt(process.env.ACCESS_TOKEN_EXPIRE || "1", 10); 
const refreshTokenExpire = parseInt(process.env.REFRESH_TOKEN_EXPIRE || "7", 10); 


export const accessTokenOption: ITokenOptions = {
  expires: new Date(Date.now() + accessTokenExpire * 24 * 60 * 60 * 1000), 
  maxAge: accessTokenExpire * 24 * 60 * 60 * 1000, 
  httpOnly: true,
   sameSite: isProd ? "none": "lax",
  secure: isProd
};

export const refreshTokenOption: ITokenOptions = {
  expires: new Date(Date.now() + refreshTokenExpire * 24 * 60 * 60 * 1000),
  maxAge: refreshTokenExpire * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: isProd ? "none": "lax",
  secure: isProd
};

export const sendToken =  async (user: IUser, statusCode: number, res: TypedResponse<AuthData | any>, next:NextFunction) => {
  const access_token = user.SignAccessToken();
  const refresh_token = user.SignRefreshToken();

// Fetch full user without password
    const dbUser = await User.findById(user._id).select("-password");
    if (!dbUser) {
      return next(new ErrorResponse("User not found", 404));
    }

    const fullUser = dbUser.toObject(); // Convert to plain JS object

    // Build session payload
    const sessionData = {
      ...fullUser,
      createdAt: Date.now(),
    };

  // Store in Redis with expiry (e.g., same as refresh token)
  await redisClient.setex(
    `session:${user._id}`,
    refreshTokenOption.maxAge / 1000, // expiry in seconds
    JSON.stringify(sessionData)
  );

  res.cookie("access_token", access_token, accessTokenOption); 

  res.cookie("refresh_token", refresh_token, refreshTokenOption);
 
   res.status(statusCode).json({
    success: true,
    data: {
      user:fullUser
    },
  });
};





