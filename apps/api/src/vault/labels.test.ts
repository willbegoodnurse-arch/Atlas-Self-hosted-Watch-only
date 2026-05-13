import assert from "node:assert/strict";
import test from "node:test";
import {
  LabelValidationError,
  deleteAddressLabels,
  deleteTransactionLabels,
  deleteUtxoNotes,
  labelMaxLength,
  labelNotesMaxLength,
  normalizeAddressLabelInput,
  normalizeOptionalNotes,
  normalizeStoredAddressLabels,
  normalizeStoredTransactionLabels,
  normalizeStoredUtxoNotes,
  normalizeTransactionLabelInput,
  normalizeUtxoNoteInput,
  normalizeWalletNotes,
  upsertAddressLabels,
  upsertTransactionLabels,
  upsertUtxoNotes
} from "./labels.js";

const updatedAt = "2026-01-01T00:00:00.000Z";
const txid = "a".repeat(64);

test("normalizes missing wallet label metadata defaults", () => {
  assert.deepEqual(normalizeStoredAddressLabels(undefined), []);
  assert.deepEqual(normalizeStoredTransactionLabels(undefined), []);
  assert.deepEqual(normalizeStoredUtxoNotes(undefined), []);
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

test("upserts, updates, and deletes UTXO notes by outpoint", () => {
  const input = normalizeUtxoNoteInput({
    txid,
    vout: 1,
    note: "Available for PSBT planning"
  });
  const inserted = upsertUtxoNotes([], input, updatedAt);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0]?.note, "Available for PSBT planning");

  const updated = upsertUtxoNotes(
    inserted,
    { ...input, note: "Tracked UTXO for cold storage consolidation" },
    updatedAt
  );
  assert.equal(updated.length, 1);
  assert.equal(updated[0]?.note, "Tracked UTXO for cold storage consolidation");

  assert.deepEqual(deleteUtxoNotes(updated, txid, 1), []);
});

test("blank label clears address metadata and blank transaction metadata", () => {
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
      label: "",
      notes: null
    }, updatedAt),
    []
  );
});

test("transaction notes can be stored without changing transaction classification data", () => {
  const input = normalizeTransactionLabelInput({
    txid,
    notes: "Tax lot note"
  });
  const inserted = upsertTransactionLabels([], input, updatedAt);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0]?.txid, txid);
  assert.equal(inserted[0]?.label, "");
  assert.equal(inserted[0]?.notes, "Tax lot note");

  assert.deepEqual(
    upsertTransactionLabels(inserted, { ...input, notes: null }, updatedAt),
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

test("treats HTML label and note input as plain metadata", () => {
  const label = normalizeAddressLabelInput({
    chain: "receive",
    index: 0,
    address: "bc1qaddress",
    label: "<script>alert(1)</script>",
    notes: "<b>plain text note</b>"
  });

  assert.equal(label.label, "<script>alert(1)</script>");
  assert.equal(label.notes, "<b>plain text note</b>");
});

test("rejects secret-looking metadata without echoing it", () => {
  const xprv =
    "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqhuCo73sNSMSH8E5p4jy2eQDsz4yoqU8A4HMsNm5ZuMfzS5n4F8tV";
  const wif = "5KYZdUEo39z3FPrtuX2QbbwGnNP5zTd7yyr2SC1j299sBCnWjss";
  const seed = "abandon ability able about above absent absorb abstract absurd abuse access accident";

  assert.throws(
    () => normalizeAddressLabelInput({
      chain: "receive",
      index: 0,
      address: "bc1qaddress",
      label: xprv,
      notes: null
    }),
    (error) => error instanceof LabelValidationError && !error.message.includes(xprv)
  );
  assert.throws(
    () => normalizeUtxoNoteInput({ txid, vout: 0, note: wif }),
    (error) => error instanceof LabelValidationError && !error.message.includes(wif)
  );
  assert.throws(
    () => normalizeTransactionLabelInput({ txid, notes: seed }),
    (error) => error instanceof LabelValidationError && !error.message.includes(seed)
  );
});
