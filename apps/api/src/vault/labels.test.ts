import assert from "node:assert/strict";
import test from "node:test";
import {
  LabelValidationError,
  deleteAddressLabels,
  deleteTransactionLabels,
  labelMaxLength,
  labelNotesMaxLength,
  normalizeAddressLabelInput,
  normalizeOptionalNotes,
  normalizeStoredAddressLabels,
  normalizeStoredTransactionLabels,
  normalizeTransactionLabelInput,
  normalizeWalletNotes,
  upsertAddressLabels,
  upsertTransactionLabels
} from "./labels.js";

const updatedAt = "2026-01-01T00:00:00.000Z";
const txid = "a".repeat(64);

test("normalizes missing wallet label metadata defaults", () => {
  assert.deepEqual(normalizeStoredAddressLabels(undefined), []);
  assert.deepEqual(normalizeStoredTransactionLabels(undefined), []);
  assert.equal(normalizeWalletNotes(undefined), null);
});

test("normalizes wallet notes", () => {
  assert.equal(normalizeWalletNotes("  Long-term cold storage wallet  "), "Long-term cold storage wallet");
  assert.equal(normalizeWalletNotes("   "), null);
});

test("upserts, updates, and deletes address labels by chain and index", () => {
  const input = normalizeAddressLabelInput({
    chain: "receive",
    index: 0,
    address: "bc1qexampleaddress",
    label: "Exchange deposit",
    notes: "Binance withdrawal"
  });
  const inserted = upsertAddressLabels([], input, updatedAt);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0]?.label, "Exchange deposit");

  const updated = upsertAddressLabels(
    inserted,
    { ...input, label: "Cold deposit", notes: null },
    updatedAt
  );
  assert.equal(updated.length, 1);
  assert.equal(updated[0]?.label, "Cold deposit");
  assert.equal(updated[0]?.notes, null);

  assert.deepEqual(deleteAddressLabels(updated, "receive", 0), []);
});

test("upserts, updates, and deletes transaction labels by txid", () => {
  const input = normalizeTransactionLabelInput({
    txid,
    label: "Cold storage deposit",
    notes: "Moved from exchange"
  });
  const inserted = upsertTransactionLabels([], input, updatedAt);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0]?.label, "Cold storage deposit");

  const updated = upsertTransactionLabels(
    inserted,
    { ...input, label: "Treasury refill", notes: null },
    updatedAt
  );
  assert.equal(updated.length, 1);
  assert.equal(updated[0]?.label, "Treasury refill");

  assert.deepEqual(deleteTransactionLabels(updated, txid), []);
});

test("blank label clears address and transaction metadata", () => {
  const addressLabel = normalizeAddressLabelInput({
    chain: "change",
    index: 3,
    address: "bc1qchangeaddress",
    label: "Change reserve",
    notes: null
  });
  const txLabel = normalizeTransactionLabelInput({
    txid,
    label: "Deposit",
    notes: null
  });

  assert.deepEqual(
    upsertAddressLabels([upsertAddressLabels([], addressLabel, updatedAt)[0]!], {
      ...addressLabel,
      label: ""
    }, updatedAt),
    []
  );
  assert.deepEqual(
    upsertTransactionLabels([upsertTransactionLabels([], txLabel, updatedAt)[0]!], {
      ...txLabel,
      label: ""
    }, updatedAt),
    []
  );
});

test("rejects invalid address label fields", () => {
  assert.throws(
    () => normalizeAddressLabelInput({ chain: "external", index: 0, address: "bc1qaddress", label: "", notes: null }),
    LabelValidationError
  );
  assert.throws(
    () => normalizeAddressLabelInput({ chain: "receive", index: -1, address: "bc1qaddress", label: "", notes: null }),
    LabelValidationError
  );
});

test("rejects invalid transaction id", () => {
  assert.throws(
    () => normalizeTransactionLabelInput({ txid: "not-a-txid", label: "Deposit", notes: null }),
    LabelValidationError
  );
});

test("rejects label and notes above limits", () => {
  assert.throws(
    () => normalizeAddressLabelInput({
      chain: "receive",
      index: 0,
      address: "bc1qaddress",
      label: "x".repeat(labelMaxLength + 1),
      notes: null
    }),
    LabelValidationError
  );
  assert.throws(
    () => normalizeOptionalNotes("x".repeat(labelNotesMaxLength + 1)),
    LabelValidationError
  );
});
