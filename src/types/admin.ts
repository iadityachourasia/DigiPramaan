import type { User } from "./user";

export interface ManagedUser extends User {
  caseLoad: number;
  jurisdictionName: string;
}

export interface RuleThresholds {
  repeatViolationCount: number;
  repeatViolationDays: number;
  ocrConfidenceThreshold: number;
  excellentMinimum: number;
  goodMinimum: number;
  poorMinimum: number;
}
