import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { googleSignInSchema, signUpSchema } from "../src/validators/auth.validator.js";
import { accepts, rejects } from "./support/rejects.js";

const valid = {
  username: "bronco_fan",
  name: "Bronco Fan",
  email: "bronco@scu.edu",
  password: "secret1",
};

describe("User", () => {
  it("[normal] a valid sign-up with an email is accepted", () => {
    const user = accepts(signUpSchema, valid);
    assert.equal(user.username, "bronco_fan");
    assert.equal(user.email, "bronco@scu.edu");
  });

  it("[normal] the email is stored in lowercase", () => {
    const user = accepts(signUpSchema, { ...valid, email: "  Bronco.Fan@SCU.edu " });
    assert.equal(user.email, "bronco.fan@scu.edu");
  });

  it("[edge] a phone number alone is enough, with email left blank", () => {
    const user = accepts(signUpSchema, {
      ...valid,
      email: "",
      phone: "(408) 554-4000",
    });
    assert.equal(user.email, undefined);
    assert.equal(user.phone, "(408) 554-4000");
  });

  it("[edge] username and password minimums: 3 and 6 pass, 2 and 5 fail", () => {
    accepts(signUpSchema, { ...valid, username: "abc" });
    accepts(signUpSchema, { ...valid, password: "123456" });
    rejects(signUpSchema, { ...valid, username: "ab" }, "Username must be at least 3 characters");
    rejects(signUpSchema, { ...valid, password: "12345" }, "Password must be at least 6 characters");
  });

  it("[invalid] neither email nor phone is rejected", () => {
    const { email: _email, ...noContact } = valid;
    rejects(signUpSchema, noContact, "Provide an email or a phone number");
    rejects(signUpSchema, { ...noContact, email: "", phone: "  " }, "Provide an email or a phone number");
  });

  it("[invalid] bad username characters, unknown gender and None/null password are rejected", () => {
    rejects(signUpSchema, { ...valid, username: "bronco fan!" }, "Username may only contain");
    rejects(signUpSchema, { ...valid, gender: "WOOKIEE" }, "Unknown gender");
    rejects(signUpSchema, { ...valid, password: null }, "Password is required");
  });

  it("[invalid] a 65-character avatar seed is too long", () => {
    accepts(signUpSchema, { ...valid, avatarSeed: "s".repeat(64) });
    rejects(signUpSchema, { ...valid, avatarSeed: "s".repeat(65) }, "Avatar seed must be at most 64 characters");
  });

  it("[edge/invalid] Google sign-in: token required, username max 30, avatar must be a URL", () => {
    accepts(googleSignInSchema, { token: "google-id-token", username: "u".repeat(30), avatarUrl: "https://example.com/a.png" });
    rejects(googleSignInSchema, { username: "bronco_fan" }, "Google token is required");
    rejects(googleSignInSchema, { token: "" }, "Google token is required");
    rejects(googleSignInSchema, { token: "google-id-token", username: "u".repeat(31) }, "Username must be at most 30 characters");
    rejects(googleSignInSchema, { token: "google-id-token", avatarUrl: "not a url" }, "Avatar must be a URL");
  });
});
