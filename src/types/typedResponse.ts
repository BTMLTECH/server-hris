import { Response } from 'express';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface TypedResponse<T> extends Response {
  json: (body: ApiResponse<T>) => this;
}
