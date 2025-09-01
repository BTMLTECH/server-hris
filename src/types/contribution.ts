export interface ContributionRequest {
  userId: string;
  companyId?: string;
  month: number;
  year: number;
  amount: number;
}
