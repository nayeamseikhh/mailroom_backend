import test from "node:test";
import assert from "node:assert/strict";
import { getClientOrigins, isClientOriginAllowed } from "./clientOrigins.js";

test("parses comma-separated client origins and ignores trailing slashes", () => {
  const origins = getClientOrigins(
    " http://localhost:5173, https://mailroom.example.com/ ",
  );

  assert.equal(origins.has("http://localhost:5173"), true);
  assert.equal(origins.has("https://mailroom.example.com"), true);
});

test("allows configured origins and requests without an Origin header only", () => {
  const origins = getClientOrigins("https://mailroom.example.com/");

  assert.equal(
    isClientOriginAllowed("https://mailroom.example.com", origins),
    true,
  );
  assert.equal(isClientOriginAllowed(undefined, origins), true);
  assert.equal(
    isClientOriginAllowed("https://mailroom.example.com.attacker.test", origins),
    false,
  );
});

test("defaults to the local Vite origin when no client origins are configured", () => {
  const origins = getClientOrigins("");

  assert.equal(isClientOriginAllowed("http://localhost:5173", origins), true);
  assert.equal(
    isClientOriginAllowed("https://mailroom.example.com", origins),
    false,
  );
});
