"use client";

import * as Y from "yjs";

export type TaskCellYDocument = {
  doc: Y.Doc;
  text: Y.Text;
};

export function createTaskCellYDocument(input: { yStateBase64?: string | null; plainText: string }): TaskCellYDocument {
  const doc = new Y.Doc();
  if (input.yStateBase64) {
    Y.applyUpdate(doc, base64ToUint8Array(input.yStateBase64));
  } else {
    doc.getText("value").insert(0, input.plainText);
  }

  return {
    doc,
    text: doc.getText("value"),
  };
}

export function replaceTaskCellYText(cellDocument: TaskCellYDocument, nextText: string) {
  const before = Y.encodeStateVector(cellDocument.doc);
  cellDocument.doc.transact(() => {
    cellDocument.text.delete(0, cellDocument.text.length);
    if (nextText) {
      cellDocument.text.insert(0, nextText);
    }
  });
  return Y.encodeStateAsUpdate(cellDocument.doc, before);
}

export function applyTaskCellYUpdate(cellDocument: TaskCellYDocument, updateBase64: string) {
  Y.applyUpdate(cellDocument.doc, base64ToUint8Array(updateBase64));
  return cellDocument.text.toString();
}

export function uint8ArrayToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToUint8Array(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
