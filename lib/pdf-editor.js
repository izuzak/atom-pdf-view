"use babel";

var path = null;
var PdfEditorView = null;

export function activate(state) {
  this.subscription = atom.workspace.addOpener(openUri);
  atom.packages.onDidActivateInitialPackages(createPdfStatusView);
}

export function deactivate() {
  this.subscription.dispose();
}

// Files with these extensions will be opened as PDFs
let pdfExtensions = null;

function openUri(uriToOpen) {
  if (path === null) {
    path = require('path');
  }
  if (pdfExtensions === null) {
    pdfExtensions = new Set(['.pdf']);
  }

  let uriExtension = path.extname(uriToOpen).toLowerCase()
  if (pdfExtensions.has(uriExtension)) {
    if (PdfEditorView === null) {
      PdfEditorView = require('./pdf-editor-view');
    }
    return new PdfEditorView(uriToOpen);
  }
}

function createPdfStatusView() {
  let PdfStatusBarView = require('./pdf-status-bar-view');
  new PdfStatusBarView();
  let PdfGoToPageView = require('./pdf-goto-page-view');
  new PdfGoToPageView();
}

export function deserialize({filePath, scale, scrollTop, scrollLeft}) {
  if (require('fs-plus').isFileSync(filePath)) {
    if (PdfEditorView === null) {
      PdfEditorView = require('./pdf-editor-view');
    }
    return new PdfEditorView(filePath, scale, scrollTop, scrollLeft);
  } else {
    console.warn("Could not deserialize PDF editor for path '#{filePath}' because that file no longer exists");
  }
}

if (parseFloat(atom.getVersion()) < 1.7) {
  atom.deserializers.add({
    "name": "PdfEditorDeserializer",
    "deserialize": deserialize
  });
}
