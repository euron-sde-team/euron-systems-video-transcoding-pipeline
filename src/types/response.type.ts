import type { Response } from "express";

export interface IResponseFormat<T = unknown> {
  data?: T;
  error?: { message: string; field?: string } & Record<string, unknown>;
  statusCode: number;
  message: string;
  success: boolean;
}

export type ResponseType = Response<IResponseFormat>;
