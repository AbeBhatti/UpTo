import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SHARE_BASE_URL, shareBaseUrlFromEnv, shareUrlFor } from "../../src/services/uptos/slug.js";

describe("Share links", () => {
  it("[normal] use the web app's origin, so a link copied locally opens locally", () => {
    const base = shareBaseUrlFromEnv({ WEB_ORIGIN: "http://localhost:3000" });
    assert.equal(shareUrlFor(base, "cn7d57"), "http://localhost:3000/u/cn7d57");
  });

  it("[edge] point at production when WEB_ORIGIN is unset or blank", () => {
    assert.equal(shareBaseUrlFromEnv({}), DEFAULT_SHARE_BASE_URL);
    assert.equal(shareBaseUrlFromEnv({ WEB_ORIGIN: "  " }), "https://up-to.co");
    assert.equal(shareUrlFor(shareBaseUrlFromEnv({ WEB_ORIGIN: "https://up-to.co/" }), "k3f9qz"), "https://up-to.co/u/k3f9qz");
  });
});
