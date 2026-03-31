import type { Response } from "express";
import { z } from "zod";
export declare const formatZodError: (error: z.ZodError) => string;
export declare const respondInvalidInput: (res: Response, error: z.ZodError) => void;
export declare const parseOrRespond: <T extends z.ZodTypeAny>(schema: T, input: unknown, res: Response) => z.infer<T> | null;
//# sourceMappingURL=request-validation.d.ts.map