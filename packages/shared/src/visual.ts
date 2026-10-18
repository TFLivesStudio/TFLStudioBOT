import { z } from "zod";
const httpsUrl = z
  .string()
  .url()
  .max(1800)
  .refine(
    (v) => v.startsWith("https://"),
    "Only HTTPS images/URLs are allowed",
  );
const field = z.object({
  name: z.string().trim().min(1).max(256),
  value: z.string().trim().min(1).max(1024),
  inline: z.boolean().default(false),
});
export const embedSchema = z
  .object({
    title: z.string().trim().min(1).max(256).optional(),
    description: z.string().trim().min(1).max(4096).optional(),
    url: httpsUrl.optional(),
    image: httpsUrl.optional(),
    thumbnail: httpsUrl.optional(),
    author: z
      .object({
        name: z.string().min(1).max(256),
        url: httpsUrl.optional(),
        iconUrl: httpsUrl.optional(),
      })
      .optional(),
    color: z.number().int().min(0).max(0xffffff).default(0x3869a5),
    footer: z.string().max(2048).optional(),
    fields: z.array(field).max(25).default([]),
  })
  .refine((e) => !!e.title || !!e.description || !!e.image, {
    message: "Embed needs a title, description or image",
  });
export const visualSchema = z
  .object({ embeds: z.array(embedSchema).max(10).default([]) })
  .superRefine((visual, ctx) => {
    const n = visual.embeds.reduce(
      (sum, e) =>
        sum +
        (e.title?.length ?? 0) +
        (e.description?.length ?? 0) +
        (e.footer?.length ?? 0) +
        (e.author?.name.length ?? 0) +
        e.fields.reduce(
          (total, f) => total + f.name.length + f.value.length,
          0,
        ),
      0,
    );
    if (n > 6000)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Combined embed text exceeds Discord's 6000-character limit",
      });
  });
export type VisualPayload = z.infer<typeof visualSchema>;
