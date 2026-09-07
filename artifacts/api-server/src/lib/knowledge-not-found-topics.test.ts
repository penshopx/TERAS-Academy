import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNotFoundTopic } from "./knowledge-not-found-topics";

test("classifies equivalent questions into one controlled anonymous topic", () => {
  const first = normalizeNotFoundTopic("help", "Bagaimana cara upload VIDEO bukti saya?");
  const second = normalizeNotFoundTopic("help", "Tolong, bagaimana upload bukti video!");
  assert.deepEqual(first, second);
  assert.equal(first.label, "Unggah bukti & dokumen");
});

test("never persists names, organizations, identifiers, or sensitive free text", () => {
  const topic = normalizeNotFoundTopic("help", "Login Ester Kristian dari AcmeHealth gagal, pegawai EMPABC123 punya kondisi medis khusus");
  assert.deepEqual(topic, { key: "access-login", label: "Akses akun & masuk" });
  assert.doesNotMatch(topic.label, /ester|kristian|acme|empabc|medis/i);
});

test("maps unknown arbitrary text to a controlled fallback", () => {
  const topic = normalizeNotFoundTopic("energy", "Rahasia organisasi Nusantara XYZABC mengandung istilah kesehatan sensitif");
  assert.deepEqual(topic, { key: "other", label: "Topik energi lainnya" });
  assert.doesNotMatch(topic.label, /nusantara|xyzabc|kesehatan|sensitif/i);
});

test("keeps the two assistant taxonomies distinct", () => {
  assert.deepEqual(normalizeNotFoundTopic("help", "energi"), { key: "other", label: "Topik Help Desk lainnya" });
  assert.deepEqual(normalizeNotFoundTopic("energy", "energi"), { key: "energy-transition", label: "Transisi energi" });
});