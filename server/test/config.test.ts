import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("development defaults are local and explicit", () => {
  assert.deepEqual(loadConfig({ NODE_ENV: "development" }), {
    nodeEnv: "development",
    host: "127.0.0.1",
    port: 3001,
    trustProxyHops: 0,
    corsOrigins: ["http://localhost:8000", "http://127.0.0.1:8000"],
    sessionSecret: "development-only-session-secret-change-before-deploy"
  });
});

test("production requires explicit CORS origins", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production" }),
    /CORS_ORIGINS must be explicitly configured/
  );
});

test("production accepts exact origins and rejects wildcard/path origins", () => {
  assert.deepEqual(
    loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "https://gym.example.com", SESSION_SECRET: "test-session-secret-with-more-than-32-characters", PASSWORD_RESET_DELIVERY_URL: "https://mail.example.com/ikigai-reset", PASSWORD_RESET_DELIVERY_TOKEN: "test-delivery-token-with-more-than-32-characters", PASSWORD_RESET_PUBLIC_URL: "https://gym.example.com/reset-password" }).corsOrigins,
    ["https://gym.example.com"]
  );
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "*", SESSION_SECRET: "test-session-secret-with-more-than-32-characters", PASSWORD_RESET_DELIVERY_URL: "https://mail.example.com/ikigai-reset", PASSWORD_RESET_DELIVERY_TOKEN: "test-delivery-token-with-more-than-32-characters", PASSWORD_RESET_PUBLIC_URL: "https://gym.example.com/reset-password" }),
    /Invalid CORS origin/
  );
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "https://gym.example.com/app", SESSION_SECRET: "test-session-secret-with-more-than-32-characters", PASSWORD_RESET_DELIVERY_URL: "https://mail.example.com/ikigai-reset", PASSWORD_RESET_DELIVERY_TOKEN: "test-delivery-token-with-more-than-32-characters", PASSWORD_RESET_PUBLIC_URL: "https://gym.example.com/reset-password" }),
    /exact HTTP\(S\) origins/
  );
});

test("production requires a strong session secret", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "https://gym.example.com", SESSION_SECRET: "short", PASSWORD_RESET_DELIVERY_URL: "https://mail.example.com/ikigai-reset", PASSWORD_RESET_DELIVERY_TOKEN: "test-delivery-token-with-more-than-32-characters", PASSWORD_RESET_PUBLIC_URL: "https://gym.example.com/reset-password" }),
    /SESSION_SECRET must be explicitly configured/
  );
});

test("production cannot use the development session-secret fallback", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "https://gym.example.com", PASSWORD_RESET_DELIVERY_URL: "https://mail.example.com/ikigai-reset", PASSWORD_RESET_DELIVERY_TOKEN: "test-delivery-token-with-more-than-32-characters", PASSWORD_RESET_PUBLIC_URL: "https://gym.example.com/reset-password" }),
    /SESSION_SECRET must be explicitly configured/
  );
});

test("invalid ports and environments fail during startup", () => {
  assert.throws(() => loadConfig({ PORT: "0" }), /PORT must be an integer/);
  assert.throws(() => loadConfig({ PORT: "3.14" }), /PORT must be an integer/);
  assert.throws(() => loadConfig({ NODE_ENV: "staging" }), /NODE_ENV must be/);
});


test("production requires a secure configured password reset delivery provider", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "https://gym.example.com", SESSION_SECRET: "test-session-secret-with-more-than-32-characters" }),
    /PASSWORD_RESET_DELIVERY_URL/
  );
  assert.throws(
    () => loadConfig({
      NODE_ENV: "production",
      CORS_ORIGINS: "https://gym.example.com",
      SESSION_SECRET: "test-session-secret-with-more-than-32-characters",
      PASSWORD_RESET_DELIVERY_URL: "http://mail.example.com/send",
      PASSWORD_RESET_DELIVERY_TOKEN: "test-delivery-token-with-more-than-32-characters",
      PASSWORD_RESET_PUBLIC_URL: "https://gym.example.com/reset-password"
    }),
    /must use HTTPS/
  );
});


test("trusted proxy hops must be explicit, bounded integers", () => {
  assert.equal(loadConfig({ NODE_ENV: "production", TRUST_PROXY_HOPS: "1", CORS_ORIGINS: "https://gym.example.com", SESSION_SECRET: "test-session-secret-with-more-than-32-characters", PASSWORD_RESET_DELIVERY_URL: "https://mail.example.com/send", PASSWORD_RESET_DELIVERY_TOKEN: "test-delivery-token-with-more-than-32-characters", PASSWORD_RESET_PUBLIC_URL: "https://gym.example.com/reset-password" }).trustProxyHops, 1);
  assert.throws(() => loadConfig({ TRUST_PROXY_HOPS: "-1" }), /TRUST_PROXY_HOPS must be/);
  assert.throws(() => loadConfig({ TRUST_PROXY_HOPS: "1.5" }), /TRUST_PROXY_HOPS must be/);
  assert.throws(() => loadConfig({ TRUST_PROXY_HOPS: "6" }), /TRUST_PROXY_HOPS must be/);
});


test("password reset public URL rejects credentials, query strings, and fragments", () => {
  const base = {
    NODE_ENV: "production",
    CORS_ORIGINS: "https://gym.example.com",
    SESSION_SECRET: "test-session-secret-with-more-than-32-characters",
    PASSWORD_RESET_DELIVERY_URL: "https://mail.example.com/send",
    PASSWORD_RESET_DELIVERY_TOKEN: "test-delivery-token-with-more-than-32-characters"
  };
  assert.throws(() => loadConfig({ ...base, PASSWORD_RESET_PUBLIC_URL: "https://user:pass@gym.example.com/reset-password" }), /must not contain credentials/);
  assert.throws(() => loadConfig({ ...base, PASSWORD_RESET_PUBLIC_URL: "https://gym.example.com/reset-password?token=unsafe" }), /must not contain a query string or fragment/);
  assert.throws(() => loadConfig({ ...base, PASSWORD_RESET_PUBLIC_URL: "https://gym.example.com/reset-password#token=unsafe" }), /must not contain a query string or fragment/);
  assert.throws(() => loadConfig({ ...base, PASSWORD_RESET_PUBLIC_URL: "https://other.example.com/reset-password" }), /origin must be included in CORS_ORIGINS/);
});
