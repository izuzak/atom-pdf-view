"use babel";

var path = null;
var PdfEditorView = null;

export const config = {
  reverseSyncBehaviour: {
    type: "string",
    enum: ['Disabled', 'Click', 'Double click'],
    'default': 'Click',
    title: "SyncTeX Reverse sync behaviour",
    description: "Specify the action on the PDF generated with the `--synctex=1` option that takes you to the source."
  },
  syncTeXPath: {
    type: "string",
    'default': "",
    title: "Path to synctex binary",
    description: "If not specified, look for `synctex` in `PATH`"
  },
  fitToWidthOnOpen: {
    type: "boolean",
    'default': false,
    title: "Fit to width on open",
    description: "When opening a document, fit it to the pane width"
  }
}

export function activate(state) {
  this.subscription = atom.workspace.addOpener(openUri);
  atom.packages.onDidActivateInitialPackages(createPdfStatusView);
}

export function deactivate() {
  this.subscription.dispose();
}

// Files with these extensions will be opened as PDFs
const pdfExtensions = new Set(['.pdf']);

function openUri(uriToOpen) {
  if (path === null) {
    path = require('path');
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
