import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ipv4ToInt,
  isAutomatedTestClientIp,
  isUndeliverableDummyPhone,
  otpClientIp,
  parseCidrs,
} from "./otpAutomatedClient.js";

const ON = {} as Record<string, string | undefined>;

test("every Google address seen sending Play test OTPs on 2026-11-20 is recognised", () => {
  for (const ip of [
    "66.249.80.234",
    "66.249.80.232",
    "66.249.88.99",
    "66.249.88.100",
    "74.125.209.164",
    "74.125.210.32",
    "74.125.210.39",
    "74.125.212.232",
    "66.102.8.10",
    "::ffff:66.249.88.99",
  ]) {
    assert.equal(isAutomatedTestClientIp(ip, ON), true, ip);
  }
});

test("real users (Indian ISPs, Supabase hook host) are never matched", () => {
  for (const ip of ["223.184.208.143", "49.36.12.5", "106.192.4.1", "13.206.153.135", "66.249.96.1", "74.126.0.1"]) {
    assert.equal(isAutomatedTestClientIp(ip, ON), false, ip);
  }
  assert.equal(isAutomatedTestClientIp(null, ON), false);
  assert.equal(isAutomatedTestClientIp("2401:4900::1", ON), false);
  assert.equal(isAutomatedTestClientIp("not-an-ip", ON), false);
});

test("env switch and custom ranges", () => {
  assert.equal(isAutomatedTestClientIp("66.249.88.99", { OTP_SUPPRESS_AUTOMATED_CLIENTS: "false" }), false);
  assert.equal(isAutomatedTestClientIp("10.1.2.3", { OTP_AUTOMATED_CLIENT_CIDRS: "10.0.0.0/8" }), true);
  assert.equal(isAutomatedTestClientIp("66.249.88.99", { OTP_AUTOMATED_CLIENT_CIDRS: "10.0.0.0/8" }), false);
});

test("CIDR parsing edge cases", () => {
  assert.equal(ipv4ToInt("256.1.1.1"), null);
  assert.equal(ipv4ToInt("1.2.3"), null);
  assert.equal(parseCidrs(["bad", "1.2.3.4/33", "1.2.3.4/0"]).length, 1);
  assert.equal(parseCidrs(["8.8.8.8"])[0]?.mask, 0xffffffff);
});

test("client IP comes from X-Real-IP (set by nginx), not a forgeable X-Forwarded-For", () => {
  assert.equal(
    otpClientIp({ "x-real-ip": "66.249.88.99", "x-forwarded-for": "1.1.1.1" }, "172.16.2.6"),
    "66.249.88.99"
  );
  assert.equal(otpClientIp({}, "172.16.2.6"), "172.16.2.6");
});

test("dummy numbers no operator issues are undeliverable", () => {
  for (const p of ["+919999999999", "9999999999", "919999999999", "0000000000", "+911111111111", "1234567890"]) {
    assert.equal(isUndeliverableDummyPhone(p), true, p);
  }
  for (const p of ["+919113194305", "+916504992804", "9876543210", "99999", ""]) {
    assert.equal(isUndeliverableDummyPhone(p), false, p);
  }
});
