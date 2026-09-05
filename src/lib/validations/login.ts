import { z } from "zod";

/**
 * Login form validation.
 *
 * Messages are injected rather than hard-coded. Every user-visible string in this
 * product lives in src/messages, and a Zod schema is not an exception to that.
 *
 * 01-login.md §2 asks for the format check to be specific to the field, while the
 * credentials failure stays generic. That split is deliberate: telling someone their
 * email is malformed helps them; telling them which half of their credentials was
 * wrong helps an attacker enumerate accounts. Only the first kind lives here.
 */

export interface LoginMessages {
  usernameRequired: string;
  passwordRequired: string;
  usernameFormat: string;
}

/**
 * Accepts either a departmental username or an email address, which is what the
 * field offers. The username shape is conservative: letters, digits, dot, hyphen and
 * underscore, at least three characters. Anything containing "@" is held to real
 * email rules instead, so a half-typed address is caught rather than passed through
 * as a valid username.
 */
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,}$/;

export function loginSchema(messages: LoginMessages) {
  return z.object({
    username: z
      .string()
      .trim()
      .min(1, { message: messages.usernameRequired })
      .refine(
        (value) =>
          value.includes("@")
            ? z.string().email().safeParse(value).success
            : USERNAME_PATTERN.test(value),
        { message: messages.usernameFormat }
      ),
    password: z.string().min(1, { message: messages.passwordRequired }),
    rememberMe: z.boolean(),
  });
}

export type LoginFormValues = z.infer<ReturnType<typeof loginSchema>>;
