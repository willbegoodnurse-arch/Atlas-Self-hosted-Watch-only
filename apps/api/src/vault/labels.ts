import type { AddressLabel, TransactionLabel, UtxoNote } from "./types.js";

export const labelMaxLength = 80;
export const labelNotesMaxLength = 500;

export type AddressLabelInput = {
  chain: "receive" | "change";
  index: number;
  address: string;
  label: string;
  notes: string | null;
};

export type TransactionLabelInput = {
  txid: string;
  label: string;
  notes: string | null;
};

export type UtxoNoteInput = {
  txid: string;
  vout: number;
  note: string | null;
};

export function normalizeWalletNotes(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const notes = value.trim();
  rejectSensitiveMetadata(notes);
  return notes ? notes.slice(0, labelNotesMaxLength) : null;
}

export function normalizeLabelText(value: unknown): string {
  if (typeof value !== "string") {
    throw new LabelValidationError("Label must be a string");
  }
  const label = value.trim();
  if (label.length > labelMaxLength) {
    throw new LabelValidationError(`Label must be ${labelMaxLength} characters or less`);
  }
  rejectSensitiveMetadata(label);
  return label;
}

export function normalizeOptionalNotes(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new LabelValidationError("Notes must be a string or null");
  }
  const notes = value.trim();
  if (notes.length > labelNotesMaxLength) {
    throw new LabelValidationError(`Notes must be ${labelNotesMaxLength} characters or less`);
  }
  rejectSensitiveMetadata(notes);
  return notes || null;
}

export function normalizeUtxoNoteText(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new LabelValidationError("UTXO note must be a string or null");
  }
  const note = value.trim();
  if (note.length > labelNotesMaxLength) {
    throw new LabelValidationError(`UTXO note must be ${labelNotesMaxLength} characters or less`);
  }
  rejectSensitiveMetadata(note);
  return note || null;
}

export function normalizeAddressLabelInput(value: {
  chain?: unknown;
  index?: unknown;
  address?: unknown;
  label?: unknown;
  notes?: unknown;
}): AddressLabelInput {
  const chain = normalizeAddressChain(value.chain);
  const index = normalizeAddressIndex(value.index);
  const address = normalizeAddressText(value.address);
  const label = normalizeLabelText(value.label);
  const notes = normalizeOptionalNotes(value.notes);
  return { chain, index, address, label, notes };
}

export function normalizeAddressLabelDeleteInput(value: {
  chain?: unknown;
  index?: unknown;
}): Pick<AddressLabelInput, "chain" | "index"> {
  return {
    chain: normalizeAddressChain(value.chain),
    index: normalizeAddressIndex(value.index)
  };
}

export function normalizeTransactionLabelInput(value: {
  txid?: unknown;
  label?: unknown;
  notes?: unknown;
}): TransactionLabelInput {
  return {
    txid: normalizeTxid(value.txid),
    label: value.label === undefined ? "" : normalizeLabelText(value.label),
    notes: normalizeOptionalNotes(value.notes)
  };
}

export function normalizeUtxoNoteInput(value: {
  txid?: unknown;
  vout?: unknown;
  note?: unknown;
}): UtxoNoteInput {
  return {
    txid: normalizeTxid(value.txid),
    vout: normalizeVout(value.vout),
    note: normalizeUtxoNoteText(value.note)
  };
}

export function normalizeTransactionLabelDeleteInput(value: {
  txid?: unknown;
}): Pick<TransactionLabelInput, "txid"> {
  return {
    txid: normalizeTxid(value.txid)
  };
}

export function normalizeStoredAddressLabels(value: unknown): AddressLabel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const labels: AddressLabel[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      continue;
    }
    try {
      labels.push({
        chain: normalizeAddressChain(candidate.chain),
        index: normalizeAddressIndex(candidate.index),
        address: normalizeAddressText(candidate.address),
        label: normalizeLabelText(candidate.label),
        notes: normalizeOptionalNotes(candidate.notes),
        updatedAt: normalizeUpdatedAt(candidate.updatedAt)
      });
    } catch {
      // Ignore invalid legacy metadata instead of breaking vault unlock.
    }
  }
  return labels;
}

export function normalizeStoredTransactionLabels(value: unknown): TransactionLabel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const labels: TransactionLabel[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      continue;
    }
    try {
      labels.push({
        txid: normalizeTxid(candidate.txid),
        label: normalizeLabelText(candidate.label),
        notes: normalizeOptionalNotes(candidate.notes),
        updatedAt: normalizeUpdatedAt(candidate.updatedAt)
      });
    } catch {
      // Ignore invalid legacy metadata instead of breaking vault unlock.
    }
  }
  return labels;
}

export function normalizeStoredUtxoNotes(value: unknown): UtxoNote[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const notes: UtxoNote[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      continue;
    }
    try {
      const note = normalizeUtxoNoteText(candidate.note);
      if (note) {
        notes.push({
          txid: normalizeTxid(candidate.txid),
          vout: normalizeVout(candidate.vout),
          note,
          updatedAt: normalizeUpdatedAt(candidate.updatedAt)
        });
      }
    } catch {
      // Ignore invalid legacy metadata instead of breaking vault unlock.
    }
  }
  return notes;
}

export function upsertAddressLabels(
  labels: AddressLabel[],
  input: AddressLabelInput,
  updatedAt: string
): AddressLabel[] {
  const withoutCurrent = deleteAddressLabels(labels, input.chain, input.index);
  if (input.label.trim() === "") {
    return withoutCurrent;
  }

  return [
    ...withoutCurrent,
    {
      ...input,
      label: input.label.trim(),
      updatedAt
    }
  ];
}

export function deleteAddressLabels(
  labels: AddressLabel[],
  chain: "receive" | "change",
  index: number
): AddressLabel[] {
  return labels.filter((label) => label.chain !== chain || label.index !== index);
}

export function upsertTransactionLabels(
  labels: TransactionLabel[],
  input: TransactionLabelInput,
  updatedAt: string
): TransactionLabel[] {
  const withoutCurrent = deleteTransactionLabels(labels, input.txid);
  if (input.label.trim() === "" && input.notes === null) {
    return withoutCurrent;
  }

  return [
    ...withoutCurrent,
    {
      ...input,
      label: input.label.trim(),
      updatedAt
    }
  ];
}

export function deleteTransactionLabels(labels: TransactionLabel[], txid: string): TransactionLabel[] {
  return labels.filter((label) => label.txid !== txid);
}

export function upsertUtxoNotes(
  notes: UtxoNote[],
  input: UtxoNoteInput,
  updatedAt: string
): UtxoNote[] {
  const withoutCurrent = deleteUtxoNotes(notes, input.txid, input.vout);
  if (!input.note) {
    return withoutCurrent;
  }

  return [
    ...withoutCurrent,
    {
      txid: input.txid,
      vout: input.vout,
      note: input.note,
      updatedAt
    }
  ];
}

export function deleteUtxoNotes(notes: UtxoNote[], txid: string, vout: number): UtxoNote[] {
  return notes.filter((note) => note.txid !== txid || note.vout !== vout);
}

function normalizeAddressChain(value: unknown): "receive" | "change" {
  if (value === "receive" || value === "change") {
    return value;
  }
  throw new LabelValidationError("Address chain must be receive or change");
}

function normalizeAddressIndex(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new LabelValidationError("Address index must be a non-negative integer");
  }
  return value;
}

function normalizeVout(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new LabelValidationError("UTXO vout must be a non-negative integer");
  }
  return value;
}

function normalizeAddressText(value: unknown): string {
  if (typeof value !== "string") {
    throw new LabelValidationError("Address must be a string");
  }
  const address = value.trim();
  if (address.length < 8 || address.length > 120) {
    throw new LabelValidationError("Address is invalid");
  }
  return address;
}

function normalizeTxid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new LabelValidationError("Transaction id must be 64 hex characters");
  }
  return value.toLowerCase();
}

function normalizeUpdatedAt(value: unknown): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : new Date(0).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectSensitiveMetadata(value: string): void {
  if (!value) {
    return;
  }

  if (hasExtendedKey(value) || hasWifPrivateKey(value) || looksLikeSeedPhrase(value)) {
    throw new LabelValidationError("Metadata cannot contain wallet keys or seed phrases");
  }
}

function hasExtendedKey(value: string): boolean {
  return /\b(xpub|ypub|zpub|tpub|upub|vpub|xprv|yprv|zprv|tprv|uprv|vprv)[1-9A-HJ-NP-Za-km-z]{40,}\b/.test(value);
}

function hasWifPrivateKey(value: string): boolean {
  return /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/.test(value);
}

function looksLikeSeedPhrase(value: string): boolean {
  const words = value.trim().toLowerCase().split(/\s+/);
  if (![12, 15, 18, 21, 24].includes(words.length)) {
    return false;
  }
  return words.every((word) => /^[a-z]{3,8}$/.test(word));
}

export class LabelValidationError extends Error {}
