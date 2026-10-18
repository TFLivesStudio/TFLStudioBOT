import { z } from "zod";
import { DEPARTMENTS, type DepartmentKey } from "./ids.js";
export const departmentSchema = z.enum(
  Object.keys(DEPARTMENTS) as [DepartmentKey, ...DepartmentKey[]],
);
export const reportSchema = z.object({
  department: departmentSchema,
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(1500),
  project: z.string().trim().max(80).nullable().default(null),
});
export const preferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).default("system"),
  accent: z.enum(["blue", "cyan", "violet"]).default("blue"),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  collapsed: z.boolean().default(false),
  notifications: z.boolean().default(true),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const sessionSchema = z.object({
  userId: z.string().regex(/^\d{17,20}$/),
  admin: z.boolean(),
  departments: z.array(departmentSchema),
  csrfToken: z.string().min(20),
});
export type Session = z.infer<typeof sessionSchema>;

export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type ApiError = { error: { code: string; message: string } };
export type Page<T> = {
  items: T[];
  limit?: number;
  offset?: number;
  basis?: string;
  completeness?: string;
};
