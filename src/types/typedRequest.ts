

import { Request } from 'express';
import { IUser } from '../models/user.model';
import { ICompany } from '../models/Company';

export interface TypedRequest<
  Params = {},
  Query = {},
  Body = {},
  Locals extends Record<string, any> = Record<string, any>
> extends Request<Params, any, Body, Query, Locals> {
  user?: IUser;
  company?: ICompany;
}
