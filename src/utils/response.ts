import { Response } from "express";

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200): Response {
  return res.status(statusCode).json({
    success: true,
    data,
  } as ApiSuccessResponse<T>);
}

export function sendSuccessMessage(res: Response, message: string, statusCode: number = 200): Response {
  return res.status(statusCode).json({
    success: true,
    data: { message },
  } as ApiSuccessResponse<{ message: string }>);
}

export function sendError(res: Response, error: string, statusCode: number = 400): Response {
  return res.status(statusCode).json({
    success: false,
    error,
  } as ApiErrorResponse);
}

