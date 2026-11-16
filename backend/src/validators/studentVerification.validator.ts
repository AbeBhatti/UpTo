import { z } from "zod";

/**
 * Student verification validators (Lab 6).
 *
 * The send endpoint refuses a personal address, a tagged address and a
 * non-address, each with its own reason. The class year's TYPE is checked
 * here; its RANGE is checked inside confirmVerification (node D5), because
 * the range depends on today's date and a bad range must leave the code
 * unspent.
 */

export const CAMPUS_DOMAIN = "scu.edu";

export const campusEmailSchema = z
  .string("Email must be text")
  .trim()
  .toLowerCase()
  .max(254, "Email is too long")
  .superRefine((value, ctx) => {
    if (!z.email().safeParse(value).success) {
      ctx.addIssue({ code: "custom", message: "That is not an email address" });
      return;
    }
    const [local, domain] = value.split("@") as [string, string];
    if (domain !== CAMPUS_DOMAIN) {
      ctx.addIssue({ code: "custom", message: `Use your @${CAMPUS_DOMAIN} address, not a personal one` });
      return;
    }
    if (local.includes("+")) {
      ctx.addIssue({ code: "custom", message: "Use your address without a +tag" });
    }
  });

export const sendCodeSchema = z.object({ email: campusEmailSchema }).strict();

export const confirmCodeSchema = z
  .object({
    email: campusEmailSchema,
    code: z.string("Code must be text").trim().regex(/^\d{6}$/, "Code must be exactly 6 digits"),
    classOf: z.number("Class year is required").int("Class year must be a whole number"),
  })
  .strict();

export const switchAccountSchema = z
  .object({
    switchToken: z.string("Switch token is required").min(1, "Switch token is required").max(256, "Switch token is too long"),
    deleteCurrent: z.boolean("deleteCurrent must be true or false").optional(),
  })
  .strict();

export type SendCodeInput = z.infer<typeof sendCodeSchema>;
export type ConfirmCodeInput = z.infer<typeof confirmCodeSchema>;
export type SwitchAccountInput = z.infer<typeof switchAccountSchema>;
