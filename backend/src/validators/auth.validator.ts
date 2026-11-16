import { z } from "zod";

/**
 * Auth validators (Lab 5, User.test.ts — 8 tests).
 *
 *   Username 3 to 30, letters / digits / underscore / period
 *   Password at least 6 (checked before hashing)
 *   Avatar seed at most 64
 *   Either an email or a phone number; the email is stored in lowercase
 *   Google sign-in: token required, username max 30, avatar must be a URL
 *
 * Every object schema is .strict(): an unexpected key is a 400, not ignored.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 80;
export const AVATAR_SEED_MAX = 64;
export const PHONE_DIGITS_MIN = 7;
export const PHONE_DIGITS_MAX = 15;

export const GENDERS = ["MALE", "FEMALE", "NON_BINARY", "OTHER", "PREFER_NOT_TO_SAY"] as const;

/** Treats a missing, null or blank string as "not supplied". */
const blankToUndefined = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "") ? undefined : value;

export const usernameSchema = z
  .string("Username must be text")
  .trim()
  .min(USERNAME_MIN, `Username must be at least ${USERNAME_MIN} characters`)
  .max(USERNAME_MAX, `Username must be at most ${USERNAME_MAX} characters`)
  .regex(/^[A-Za-z0-9_.]+$/, "Username may only contain letters, numbers, underscores and periods");

export const passwordSchema = z
  .string("Password is required")
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`);

export const emailSchema = z
  .string("Email must be text")
  .trim()
  .toLowerCase()
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address"));

export const phoneSchema = z
  .string("Phone number must be text")
  .trim()
  .max(20, "Phone number is too long")
  .regex(/^\+?[\d\s().-]+$/, "Enter a valid phone number")
  .refine((value) => {
    const digits = value.replace(/\D/g, "").length;
    return digits >= PHONE_DIGITS_MIN && digits <= PHONE_DIGITS_MAX;
  }, `Phone number must have ${PHONE_DIGITS_MIN} to ${PHONE_DIGITS_MAX} digits`);

export const avatarSeedSchema = z
  .string("Avatar seed must be text")
  .max(AVATAR_SEED_MAX, `Avatar seed must be at most ${AVATAR_SEED_MAX} characters`);

export const signUpSchema = z
  .object({
    username: usernameSchema,
    name: z
      .string("Name is required")
      .trim()
      .min(1, "Name is required")
      .max(NAME_MAX, `Name must be at most ${NAME_MAX} characters`),
    email: z.preprocess(blankToUndefined, emailSchema.optional()),
    phone: z.preprocess(blankToUndefined, phoneSchema.optional()),
    password: passwordSchema,
    avatarSeed: avatarSeedSchema.optional(),
    gender: z.enum(GENDERS, "Unknown gender").optional(),
  })
  .strict()
  .refine((body) => body.email !== undefined || body.phone !== undefined, {
    message: "Provide an email or a phone number",
    path: ["email"],
  });

export const signInSchema = z
  .object({
    identifier: z.string("Enter your username, email or phone").trim().min(1, "Enter your username, email or phone").max(254),
    password: z.string("Password is required").min(1, "Password is required").max(PASSWORD_MAX),
  })
  .strict();

/** Validator only: the OAuth flow itself is out of scope this week. */
export const googleSignInSchema = z
  .object({
    token: z.string("Google token is required").min(1, "Google token is required"),
    username: usernameSchema.optional(),
    avatarUrl: z.url("Avatar must be a URL").optional(),
  })
  .strict();

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type GoogleSignInInput = z.infer<typeof googleSignInSchema>;
