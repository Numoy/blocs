import { z } from "zod";

const httpUrlSchema = z.string().url().max(2000).refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
}, {
    message: "URL must use HTTP(S).",
});

export const clientErrorPayloadSchema = z.object({
    name: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(2000),
    stack: z.string().max(16_000).optional(),
    componentStack: z.string().max(16_000).optional(),
    href: httpUrlSchema.optional(),
    userAgent: z.string().max(1200).optional(),
    timestamp: z.string().datetime(),
});

export type ClientErrorPayload = z.infer<typeof clientErrorPayloadSchema>;

export const parseClientErrorPayload = (payload: unknown) => {
    return clientErrorPayloadSchema.safeParse(payload);
};
